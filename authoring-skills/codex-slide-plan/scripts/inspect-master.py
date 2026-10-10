#!/usr/bin/env python3
"""Bounded, read-only OOXML design inspection. Python 3 standard library only.
This reports source structures, never renders or converts a presentation.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import posixpath
import re
import stat
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main",
      "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
      "ct": "http://schemas.openxmlformats.org/package/2006/content-types"}
LIMITS = {"archiveBytes": 64 * 1024 * 1024, "entries": 2048,
          "partBytes": 8 * 1024 * 1024, "totalBytes": 64 * 1024 * 1024,
          "compressionRatio": 1000, "xmlNodes": 100000, "xmlDepth": 128}
MAIN_TYPES = {"pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
              "potx": "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"}


def require(test, message):
    if not test:
        raise ValueError(message)


def local(tag):
    return tag.rsplit("}", 1)[-1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    require(name and "\\" not in name and "\x00" not in name and not name.startswith("/"), "Unsafe ZIP path")
    parts = name.rstrip("/").split("/")
    require(all(p not in ("", ".", "..") for p in parts), "Unsafe ZIP path")
    require(not re.match(r"^[a-zA-Z]:", name), "Unsafe ZIP drive path")
    return name


class Package:
    def __init__(self, data):
        self.zip = zipfile.ZipFile(__import__("io").BytesIO(data))
        entries = self.zip.infolist()
        require(len(entries) <= LIMITS["entries"], "ZIP entry limit exceeded")
        names, total = set(), 0
        for item in entries:
            safe_name(item.filename)
            require(item.filename not in names, "Duplicate ZIP part")
            names.add(item.filename)
            require(not (item.flag_bits & 1), "Encrypted ZIP parts are unsupported")
            require(not stat.S_ISLNK(item.external_attr >> 16), "ZIP symlink refused")
            require(item.file_size <= LIMITS["partBytes"], "ZIP part size limit exceeded")
            require(item.file_size <= max(item.compress_size, 1) * LIMITS["compressionRatio"], "ZIP compression ratio limit exceeded")
            total += item.file_size
        require(total <= LIMITS["totalBytes"], "ZIP expanded size limit exceeded")
        self.names = names
        self.cache = {}
        self.relationships = {}
        # Validate *all* XML parts, including otherwise unused parts.
        for name in sorted(names):
            if name.endswith((".xml", ".rels")) or name == "[Content_Types].xml":
                self.xml(name)
        for name in sorted(names):
            if name.endswith(".rels"):
                owner = self.owner(name)
                records = []
                ids = set()
                for node in self.xml(name):
                    require(local(node.tag) == "Relationship", "Unexpected relationship XML")
                    rid, target, kind = node.get("Id"), node.get("Target"), node.get("Type")
                    require(rid and target and kind and rid not in ids, "Invalid/duplicate relationship")
                    ids.add(rid)
                    external = node.get("TargetMode") == "External"
                    if external:
                        resolved = None  # Never fetch URLs or local external references.
                    else:
                        require("\\" not in target and not re.search(r"[%?#\x00]", target), "Unsafe relationship target")
                        require(not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target), "Relationship URI requires External mode")
                        resolved = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(posixpath.dirname(owner), target))
                        safe_name(resolved)
                        require(resolved in names, "Missing relationship target: " + resolved)
                    records.append({"id": rid, "type": kind.rsplit("/", 1)[-1], "target": target,
                                    "part": resolved, "external": external})
                self.relationships[owner] = records

    @staticmethod
    def owner(name):
        if name == "_rels/.rels":
            return ""
        p = PurePosixPath(name)
        require(p.parent.name == "_rels", "Unexpected relationship location")
        return str(p.parent.parent / p.name[:-5])

    def read(self, name):
        data = self.zip.read(name)
        require(len(data) <= LIMITS["partBytes"], "Part size limit exceeded while reading")
        return data

    def xml(self, name):
        if name not in self.cache:
            data = self.read(name)
            # UTF-16/32 can conceal entity declarations in NUL-interleaved bytes.
            require(b"\x00" not in data, "Only UTF-8/ASCII XML is supported")
            require(not re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", data, re.I), "XML DTD/entities refused")
            root = ET.fromstring(data)
            require(sum(1 for _ in root.iter()) <= LIMITS["xmlNodes"], "XML node limit exceeded")
            pending = [(root, 0)]
            while pending:
                current, depth = pending.pop()
                require(depth <= LIMITS["xmlDepth"], "XML nesting limit exceeded")
                pending.extend((child, depth + 1) for child in current)
            self.cache[name] = root
        return self.cache[name]

    def rels(self, part, kind=None):
        return [r for r in self.relationships.get(part, []) if kind is None or r["type"] == kind]

    def linked(self, part, kind):
        return [r["part"] for r in self.rels(part, kind) if not r["external"]]


def color(node):
    if node is None:
        return None
    for child in node:
        name = local(child.tag)
        if name in ("srgbClr", "sysClr", "schemeClr", "prstClr", "scrgbClr"):
            value = child.get("lastClr") if name == "sysClr" else child.get("val")
            out = {"kind": name, "value": value, "transforms": [{"kind": local(t.tag), **t.attrib} for t in child]}
            if name in ("srgbClr", "sysClr") and value and re.fullmatch(r"[0-9A-Fa-f]{6}", value):
                out["hex"] = "#" + value.lower()
            return out
    return None


def rect(node, size):
    if node is None:
        return None
    off, ext = node.find("a:off", NS), node.find("a:ext", NS)
    if off is None or ext is None:
        return None
    values = [int(off.get(k, "0")) for k in ("x", "y")] + [int(ext.get(k, "0")) for k in ("cx", "cy")]
    require(all(abs(v) <= 2**53 for v in values), "Geometry integer out of range")
    return {"emu": dict(zip(("x", "y", "width", "height"), values)),
            "percent": dict(zip(("x", "y", "width", "height"), [round(v / size[i % 2] * 100, 6) for i, v in enumerate(values)])),
            "rotation": int(node.get("rot", "0")) / 60000,
            "flipH": node.get("flipH") in ("1", "true"), "flipV": node.get("flipV") in ("1", "true")}


def shape_info(node, size, part, package):
    kind = local(node.tag)
    nv = node.find(".//p:cNvPr", NS)
    ph = node.find("p:nvSpPr/p:nvPr/p:ph", NS)
    xfrm = node.find("p:spPr/a:xfrm", NS)
    if xfrm is None:
        xfrm = node.find("p:xfrm", NS)
    body = node.find("p:txBody/a:bodyPr", NS)
    styles = []
    for style in node.findall(".//a:rPr", NS) + node.findall(".//a:defRPr", NS) + node.findall(".//a:endParaRPr", NS):
        entry = {"attributes": style.attrib, "color": color(style.find("a:solidFill", NS)),
                 "fonts": [{"script": local(n.tag), "typeface": n.get("typeface")} for n in style if local(n.tag) in ("latin", "ea", "cs")]}
        if entry not in styles:
            styles.append(entry)
    result = {"kind": kind, "id": nv.get("id") if nv is not None else None,
              "name": nv.get("name") if nv is not None else None,
              "placeholder": dict(ph.attrib) if ph is not None else None,
              "geometry": rect(xfrm, size), "fill": color(node.find("p:spPr/a:solidFill", NS)),
              "text": "\n".join(n.text or "" for n in node.findall(".//a:t", NS)),
              "textBody": dict(body.attrib) if body is not None else None, "textStyles": styles}
    if kind == "pic":
        blip = node.find(".//a:blip", NS)
        rid = blip.get("{" + NS["r"] + "}embed") if blip is not None else None
        link = blip.get("{" + NS["r"] + "}link") if blip is not None else None
        relation = next((r for r in package.rels(part) if r["id"] == (rid or link)), None)
        result["image"] = relation
        if relation and not relation["external"]:
            raw = package.read(relation["part"])
            result["image"] = {**relation, "sha256": sha(raw), "bytes": len(raw)}
        result["crop"] = dict(node.find(".//a:srcRect", NS).attrib) if node.find(".//a:srcRect", NS) is not None else None
        result["logoCandidate"] = "logo" in (result["name"] or "").lower()
        result["logoConfirmed"] = False
    if kind == "grpSp":
        result["unresolved"] = "Group child transforms are not flattened"
        result["children"] = [shape_info(c, size, part, package) for c in node if local(c.tag) in ("sp", "pic", "graphicFrame", "grpSp", "cxnSp")]
    if kind in ("graphicFrame", "cxnSp"):
        result["unresolved"] = "Complex drawing content is not reconstructed"
    return result


def design_part(part, package, size):
    root = package.xml(part)
    tree = root.find("p:cSld/p:spTree", NS)
    bg = root.find("p:cSld/p:bg/p:bgPr/a:solidFill", NS)
    clrmap = root.find("p:clrMap", NS)
    return {"part": part, "kind": local(root.tag), "name": root.get("name") or (root.find("p:cSld", NS).get("name") if root.find("p:cSld", NS) is not None else None),
            "attributes": root.attrib, "background": color(bg),
            "backgroundReference": dict(root.find("p:cSld/p:bg/p:bgRef", NS).attrib) if root.find("p:cSld/p:bg/p:bgRef", NS) is not None else None,
            "colorMap": dict(clrmap.attrib) if clrmap is not None else None,
            "relationships": package.rels(part),
            "shapes": [shape_info(n, size, part, package) for n in tree if local(n.tag) in ("sp", "pic", "graphicFrame", "grpSp", "cxnSp")] if tree is not None else [],
            "textStyles": ET.tostring(root.find("p:txStyles", NS), encoding="unicode") if root.find("p:txStyles", NS) is not None else None}


def theme_info(part, package):
    root = package.xml(part)
    scheme = root.find("a:themeElements/a:clrScheme", NS)
    fonts = root.find("a:themeElements/a:fontScheme", NS)
    return {"part": part, "name": root.get("name"),
            "colors": {local(n.tag): color(n) for n in scheme} if scheme is not None else {},
            "fonts": {local(group.tag): [{"script": local(n.tag), **n.attrib} for n in group] for group in fonts} if fonts is not None else {},
            "unresolved": ["Effect/fill style matrix is recorded only as source XML; it is not mapped into CSS"],
            "formatScheme": ET.tostring(root.find("a:themeElements/a:fmtScheme", NS), encoding="unicode") if root.find("a:themeElements/a:fmtScheme", NS) is not None else None}


def resolved_color(value, theme, cmap=None):
    if not value or value.get("transforms"):
        return None
    if "hex" in value:
        return value["hex"]
    if value["kind"] == "schemeClr":
        key = (cmap or {}).get(value["value"], value["value"])
        return theme.get("colors", {}).get(key, {}).get("hex") if theme.get("colors", {}).get(key) else None
    return None


def inspect(input_path):
    path = Path(input_path)
    require(path.suffix.lower().lstrip(".") in MAIN_TYPES, "Input must be .pptx or .potx")
    require(path.is_file(), "Input is not a regular file")
    require(path.stat().st_size <= LIMITS["archiveBytes"], "Archive size limit exceeded")
    # A fixed bounded read also protects against an input growing after stat().
    with path.open("rb") as stream:
        data = stream.read(LIMITS["archiveBytes"] + 1)
    require(len(data) <= LIMITS["archiveBytes"], "Archive size limit exceeded")
    package = Package(data)
    require("[Content_Types].xml" in package.names and "ppt/presentation.xml" in package.names, "Not an OOXML presentation")
    types = package.xml("[Content_Types].xml")
    main = next((n.get("ContentType") for n in types if n.get("PartName") == "/ppt/presentation.xml"), None)
    detected = next((ext for ext, value in MAIN_TYPES.items() if value == main), None)
    require(detected is not None, "Unsupported presentation main content type (macros/other formats are refused)")
    require(detected == path.suffix.lower()[1:], "Extension/content-type mismatch; renaming is not conversion")
    presentation = package.xml("ppt/presentation.xml")
    require(local(presentation.tag) == "presentation", "Unexpected presentation XML root")
    size_node = presentation.find("p:sldSz", NS)
    require(size_node is not None, "Slide size missing")
    size = (int(size_node.get("cx", "0")), int(size_node.get("cy", "0")))
    require(all(0 < n <= 2**53 for n in size), "Invalid slide size")
    gcd = math.gcd(*size)
    ratio = [size[0] // gcd, size[1] // gcd]
    catalog_ratio = ratio if max(ratio) <= 100 else [round(n / max(size) * 100, 9) for n in size]
    def ordered(kind):
        list_tag, item_tag = ("sldMasterIdLst", "sldMasterId") if kind == "slideMaster" else ("sldIdLst", "sldId")
        linked = {r["id"]: r for r in package.rels("ppt/presentation.xml", kind)}
        parts = []
        for node in presentation.findall("p:" + list_tag + "/p:" + item_tag, NS):
            rid = node.get("{" + NS["r"] + "}id")
            require(rid in linked and not linked[rid]["external"], "Missing ordered presentation relationship")
            require(linked[rid]["part"] not in parts, "Duplicate presentation list target")
            parts.append(linked[rid]["part"])
        return parts
    masters = [design_part(p, package, size) for p in ordered("slideMaster")]
    layout_paths = list(dict.fromkeys(p for m in masters for p in package.linked(m["part"], "slideLayout")))
    layouts = [design_part(p, package, size) for p in layout_paths]
    slides = [design_part(p, package, size) for p in ordered("slide")]
    theme_paths = list(dict.fromkeys(p for m in masters + layouts + slides for kind in ("theme", "themeOverride") for p in package.linked(m["part"], kind)))
    themes = [theme_info(p, package) for p in theme_paths]
    warnings = ["Structural inspection only. Source slide rendering and font availability remain unverified.",
                "No native PowerPoint master structure, animation or round-trip editing is preserved.",
                "Geometry is local to each shape. Placeholder inheritance, group transforms, effects and color transforms need manual review."]
    if any(r["external"] for records in package.relationships.values() for r in records):
        warnings.append("External relationships were recorded but never fetched or embedded.")
    require(masters and themes, "Presentation must contain a linked master and theme for this design inspector")
    master, theme = masters[0], themes[0]
    choose = lambda key, fallback: resolved_color(theme["colors"].get(key), theme) or fallback
    background = resolved_color(master["background"], theme, master["colorMap"])
    major = next((f.get("typeface") for f in theme["fonts"].get("majorFont", []) if f["script"] == "latin"), None)
    font = major + ", sans-serif" if major and re.fullmatch(r"[\w\s'-]+", major, re.ASCII) else "Arial, sans-serif"
    lefts = [s["geometry"]["percent"]["x"] for s in master["shapes"] if s["placeholder"] and s["geometry"]]
    padding = max(2, min(15, min(lefts))) if lefts else 6
    suggestion = {"id": "master-reference", "name": theme["name"] or "Imported master reference",
                  "background": background or choose("lt1", "#ffffff"), "ink": choose("dk1", "#111111"),
                  "accent": choose("accent1", "#3158a8"), "muted": choose("dk2", "#666666"),
                  "font": font, "ratio": catalog_ratio, "padding": padding,
                  "footer": next((s["text"] for s in master["shapes"] if s["placeholder"] and s["placeholder"].get("type") == "ftr" and s["text"]), "")}
    if background is None:
        warnings.append("Theme suggestion background uses lt1 fallback; confirm actual slide/layout background visually.")
    if not major or font == "Arial, sans-serif" and major != "Arial":
        warnings.append("Theme suggestion substitutes Arial; inspect original script fonts and installed fonts before acceptance.")
    return {"schemaVersion": 1, "input": {"name": path.name, "sha256": sha(data), "bytes": len(data), "format": detected, "originalChanged": False},
            "limits": LIMITS, "page": {"widthEmu": size[0], "heightEmu": size[1], "ratio": ratio, "catalogRatio": catalog_ratio, "type": size_node.get("type")},
            "masters": masters, "layouts": layouts, "themes": themes, "slides": slides,
            "renderStatus": {"status": "unverified", "reason": "This inspector does not render PPTX/POTX or verify actual slide appearance."},
            "mapping": {"status": "proposed-not-applied", "themeSuggestion": suggestion,
                        "masterPart": master["part"], "themePart": theme["part"],
                        "logoCandidates": [{"part": m["part"], "shapeId": s["id"], "name": s["name"], "image": s["image"], "geometry": s["geometry"], "confirmed": False} for m in masters for s in m["shapes"] if s["kind"] == "pic"],
                        "requiresConfirmation": ["Select master/layout and confirm inherited placeholder geometry", "Confirm logo identity and usage permission", "Confirm fonts/substitutions, margins, colors and visual comparison"]},
            "warnings": warnings}


def write_report(path, report, input_path):
    out = Path(path)
    require(out.resolve() != Path(input_path).resolve(), "Output overlaps input")
    require(out.parent.is_dir(), "Output parent must already exist")
    require(out.parent.resolve() == out.parent.absolute(), "Output parent symlinks refused")
    # O_EXCL rejects existing regular files and symlinks atomically.
    with out.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Existing .pptx or .potx, read-only")
    parser.add_argument("--out", help="Optional JSON report in an existing directory; never overwrites")
    args = parser.parse_args()
    try:
        report = inspect(args.input)
        if args.out:
            write_report(args.out, report, args.input)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError, ET.ParseError, zipfile.BadZipFile, RuntimeError, NotImplementedError, RecursionError) as error:
        print("inspect-master: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
