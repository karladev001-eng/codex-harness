// Current reader-facing documents. Historical documents are targets, not checked entry points.
const fs = require('node:fs');
const path = require('node:path');
const entries = ['README.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'SPEC.md', 'VALIDATION.md', 'docs/README.md', 'authoring-skills/README.md', 'authoring-skills/INSTALL.md', 'knowledge/README.md', 'knowledge/extension/README.md', 'integrations/raycast-knowledge/README.md'];
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]);
}
function currentDocuments(root) {
  return [...entries, ...['docs/guides', 'docs/maintainers'].flatMap(dir => walk(path.join(root, dir)).filter(file => file.endsWith('.md')).map(file => path.relative(root, file)))];
}
function links(text) {
  // Code examples are not references. Support inline/image and reference-style Markdown links.
  const prose = text.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)|^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)].map(match => (match[1] || match[2]).replace(/^<|>$/g, ''));
}
function relocate(text, source, destination, resolveTarget) {
  return text.replace(/(\]\()(<[^>]+>|[^\s)]+)(\))/g, (whole, open, href, close) => {
    const raw = href.replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(raw)) return whole;
    const [file, fragment] = raw.split('#');
    const target = resolveTarget(path.resolve(path.dirname(source), decodeURIComponent(file)));
    const relative = path.relative(path.dirname(destination), target).split(path.sep).join('/');
    return open + relative + (fragment ? '#' + fragment : '') + close;
  });
}
module.exports = { entries, walk, currentDocuments, links, relocate };
