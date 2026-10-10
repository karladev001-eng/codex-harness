#!/usr/bin/env python3
"""Create independent, deterministic OOXML regression fixtures in a fresh directory.
Python 3 standard library only. Synthetic values and test mark are not real branding.
This does not convert user presentations or provide PowerPoint export.
"""
import argparse
import binascii
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import zipfile
import zlib
from xml.sax.saxutils import escape

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
COLOR = {'background':'#f8fafc','ink':'#182c46','accent':'#c54163','muted':'#54647a'}
TITLE = 'Master reference fixture'
BODY = 'A synthetic fixture for geometry and color checks.\nCompare the source master with the HTML design.'


def png_mark():
    # A deliberately simple test pattern, not an illustrative/branding asset.
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', binascii.crc32(kind + payload) & 0xffffffff)
    rows = b''.join(b'\0' + b''.join(bytes((197,65,99,255) if x < 16 else (24,44,70,255)) for x in range(32)) for _ in range(32))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',32,32,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(rows,9)) + chunk(b'IEND',b'')


def rels(items):
    return f'<Relationships xmlns="{REL}">' + ''.join(f'<Relationship Id="{rid}" Type="{R}/{kind}" Target="{target}"/>' for rid,kind,target in items) + '</Relationships>'


def box(size, x, y, width, height):
    return [round(n / 100 * size[i % 2]) for i,n in enumerate((x,y,width,height))]


def xfrm(geometry):
    x,y,w,h = geometry
    return f'<a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>'


def text_shape(sid, name, placeholder, geometry, text, fontsize, color):
    paragraphs = ''.join('<a:p><a:r><a:rPr lang="en-US" sz="%s"><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>%s</a:t></a:r><a:endParaRPr lang="en-US" sz="%s"/></a:p>' % (fontsize,color,escape(line),fontsize) for line in text.split('\n'))
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr/><p:nvPr><p:ph type="{placeholder}" idx="{sid}"/></p:nvPr></p:nvSpPr><p:spPr>{xfrm(geometry)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>{paragraphs}</p:txBody></p:sp>'


def picture(geometry):
    return f'<p:pic><p:nvPicPr><p:cNvPr id="4" name="Synthetic fixture logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>{xfrm(geometry)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'


def tree(shapes):
    return '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + ''.join(shapes) + '</p:spTree>'


def document(kind, body, attributes=''):
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:{kind} xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}" {attributes}>{body}</p:{kind}>'


def fixture(ratio, template=False):
    size = (9144000, round(9144000 * ratio[1] / ratio[0]))
    geometry = { 'title':box(size,8,10,76,15), 'body':box(size,8,35,76,38), 'logo':box(size,88,8,5,5*ratio[0]/ratio[1]) }
    master_shapes = [text_shape(2,'Master title','title',geometry['title'],'Click to edit master title',3200,COLOR['ink'][1:]),text_shape(3,'Master body','body',geometry['body'],'Click to edit master body',2200,COLOR['ink'][1:]),picture(geometry['logo'])]
    slide_shapes = [text_shape(2,'Slide title','title',geometry['title'],TITLE,3200,COLOR['ink'][1:]),text_shape(3,'Slide body','body',geometry['body'],BODY,2200,COLOR['ink'][1:])]
    cmap = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>'
    main_type = 'application/vnd.openxmlformats-officedocument.presentationml.' + ('template' if template else 'presentation') + '.main+xml'
    overrides = {'/ppt/presentation.xml':main_type,'/ppt/slideMasters/slideMaster1.xml':'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml','/ppt/slideLayouts/slideLayout1.xml':'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml','/ppt/slides/slide1.xml':'application/vnd.openxmlformats-officedocument.presentationml.slide+xml','/ppt/theme/theme1.xml':'application/vnd.openxmlformats-officedocument.theme+xml'}
    colors = {'dk1':COLOR['ink'][1:],'lt1':COLOR['background'][1:],'dk2':COLOR['muted'][1:],'lt2':'FFFFFF','accent1':COLOR['accent'][1:],'accent2':'365C85','accent3':'39856C','accent4':'8C6DB1','accent5':'B7862A','accent6':'7A8B9D','hlink':'145FCC','folHlink':'743BA0'}
    theme = f'<a:theme xmlns:a="{A}" name="Synthetic fixture"><a:themeElements><a:clrScheme name="Fixture">' + ''.join(f'<a:{k}><a:srgbClr val="{v}"/></a:{k}>' for k,v in colors.items()) + '</a:clrScheme><a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Fixture"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
    parts = {
        '[Content_Types].xml':f'<Types xmlns="{CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' + ''.join(f'<Override PartName="{k}" ContentType="{v}"/>' for k,v in overrides.items()) + '</Types>',
        '_rels/.rels':rels([('rId1','officeDocument','ppt/presentation.xml')]),
        'ppt/presentation.xml':document('presentation','<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'+f'<p:sldSz cx="{size[0]}" cy="{size[1]}"/><p:notesSz cx="6858000" cy="9144000"/>'),
        'ppt/_rels/presentation.xml.rels':rels([('rId1','slideMaster','slideMasters/slideMaster1.xml'),('rId2','slide','slides/slide1.xml')]),
        'ppt/slideMasters/slideMaster1.xml':document('sldMaster','<p:cSld name="Fixture master"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+COLOR['background'][1:]+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'+tree(master_shapes)+'</p:cSld>'+cmap+'<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>'),
        'ppt/slideMasters/_rels/slideMaster1.xml.rels':rels([('rId1','slideLayout','../slideLayouts/slideLayout1.xml'),('rId2','theme','../theme/theme1.xml'),('rId3','image','../media/logo.png')]),
        'ppt/slideLayouts/slideLayout1.xml':document('sldLayout','<p:cSld name="Title and body">'+tree([])+'</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>', 'type="obj" preserve="1"'),
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels':rels([('rId1','slideMaster','../slideMasters/slideMaster1.xml')]),
        'ppt/slides/slide1.xml':document('sld','<p:cSld>'+tree(slide_shapes)+'</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'),
        'ppt/slides/_rels/slide1.xml.rels':rels([('rId1','slideLayout','../slideLayouts/slideLayout1.xml')]),
        'ppt/theme/theme1.xml':theme,
        'ppt/media/logo.png':png_mark()
    }
    import io
    stream = io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name,value in sorted(parts.items()):
            info = zipfile.ZipInfo(name, date_time=(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644 << 16
            archive.writestr(info,value.encode('utf-8') if isinstance(value,str) else value)
    return stream.getvalue(), geometry, size


def deck(ratio, geometry, size, name, pptx, image):
    percent = lambda key: dict(zip(('x','y','width','height'),[round(n/size[i%2]*100,6) for i,n in enumerate(geometry[key])]))
    theme = {'id':'fixture-master-theme','name':'Extracted synthetic master theme',**COLOR,'font':'Arial, sans-serif','ratio':ratio,'padding':8,'footer':''}
    layout = {'id':'fixture-master-layout','version':'v1','name':'Master title and body','purpose':'Fixture master geometry comparison','structure':'Title, body and source logo at OOXML geometry','hideKicker':True,'titleBox':percent('title'),'canvas':{'slots':[{'elementId':'body',**percent('body')},{'elementId':'logo',**percent('logo')}]}}
    return {'schemaVersion':2,'id':'master-'+name,'revision':'r1','title':TITLE,'purpose':'Compare a synthetic master with an HTML design','audience':'Skill maintainers','message':'Master geometry and colors can be recorded and reconstructed.','expectedOutcome':'Identify structural matches and visual limitations.','requestedSlides':1,'chapters':[{'id':'intro','title':'Reference'}],'unresolved':['Source rendering and HTML visual comparison must be recorded separately.'],'sources':[{'id':'synthetic','kind':'concept','title':'Independent OOXML test fixture','label':'概念図・synthetic fixture','checkedAt':'2026-10-10'}],'assets':[{'id':'fixture-logo','file':'assets/logo.png','origin':'Deterministic two-color synthetic fixture test mark','license':'Fixture only; no real brand represented','regenerate':'python3 scripts/make-fixtures.py --out NEW_DIR','sourceIds':['synthetic'],'slideIds':['S01']}],'variants':[{'id':'A','themeId':theme['id'],'layouts':{'S01':layout['id']}}],'design':{'themes':[theme],'layouts':[layout]},'slides':[{'id':'S01','chapter':'intro','role':'design reference','title':TITLE,'message':'','talkingPoints':['Compare the source geometry and logo before accepting the reconstruction.'],'transition':'End of the one-slide fixture.','seconds':30,'notes':'Synthetic fixture. No factual result or real company branding.','sourceIds':['synthetic'],'layoutId':layout['id'],'paragraphs':[{'id':'P01','text':'This synthetic source contains a master, layout and theme. The HTML design records their relationship and keeps visual verification separate from structural checks.','sourceIds':['synthetic']}],'elements':[{'id':'body','kind':'text','text':BODY,'sourceIds':['synthetic']},{'id':'logo','kind':'image','assetId':'fixture-logo','alt':'Synthetic two-color fixture logo','sourceIds':['synthetic']}]}],'files':['references/'+name+'.pptx'],'master':{'status':'reconstructed HTML design reference','input':{'path':'references/'+name+'.pptx','sha256':hashlib.sha256(pptx).hexdigest()},'masterMapping':[{'source':'ppt/slideMasters/slideMaster1.xml','themeId':theme['id']}],'layoutMapping':[{'source':'ppt/slideLayouts/slideLayout1.xml','htmlLayoutId':layout['id'],'slideId':'S01'}],'design':{'ratio':ratio,'colors':COLOR,'fonts':['Arial'],'logos':[{'sourcePart':'ppt/media/logo.png','assetId':'fixture-logo','sha256':hashlib.sha256(image).hexdigest(),'geometry':percent('logo')}],'geometry':{key:percent(key) for key in geometry}},'substitutions':['Native PPTX master/layout becomes ordinary HTML theme and rectangle slots.','Browser may substitute Arial; actual installed font is not guaranteed.','Native text margins are zero; HTML has its own text formatting.'],'comparison':{'structural':'Test normalized rectangles, theme colors, ratio and unchanged logo bytes.','tolerances':{'ratioAbsolute':0.000001,'geometryPercentagePoints':0.001,'colorChannel':0,'logoSHA256':'exact'},'sourceVisual':'unverified until actual source render is recorded','htmlVisual':'unverified until browser review is recorded'},'unverified':['Visual equality, font metrics, paragraph wrapping, shadow/effects and inherited styles.']}}


def create(out):
    root = Path(out)
    if not root.parent.is_dir() or root.parent.resolve() != root.parent.absolute():
        raise ValueError('Parent must be an existing directory without symlinks')
    root.mkdir()  # exclusive, never merge/overwrite
    try:
        for name,ratio in [('standard-4x3',[4,3]),('wide-16x9',[16,9])]:
            folder = root / name
            (folder/'assets').mkdir(parents=True)
            (folder/'references').mkdir()
            content, geometry, size = fixture(ratio)
            image=png_mark()
            (folder/'references'/(name+'.pptx')).write_bytes(content)
            (folder/'assets'/'logo.png').write_bytes(image)
            template,_,_ = fixture(ratio,True)
            (folder/'references'/(name+'.potx')).write_bytes(template)
            document = deck(ratio,geometry,size,name,content,image)
            # Master demos intentionally have no visible message duplicate; core requires a nonempty message.
            document['slides'][0]['message'] = 'Synthetic master reference'
            document['design']['layouts'][0]['messageBox'] = {'x':8,'y':85,'width':76,'height':5}
            (folder/'deck.json').write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        (root/'fixture-manifest.json').write_text(json.dumps({'schemaVersion':1,'origin':'Independently authored synthetic OOXML test inputs. No user master provided.','generator':'scripts/make-fixtures.py','ratios':[[4,3],[16,9]],'renderStatus':'unverified; generator creates OOXML, not source screenshots','files':sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file())},indent=2)+'\n',encoding='utf-8')
    except Exception:
        shutil.rmtree(root)
        raise
    return {'directory':str(root),'fixtures':['standard-4x3','wide-16x9'],'renderStatus':'unverified'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',required=True,help='Fresh fixture directory; existing paths are refused')
    args=parser.parse_args()
    try:
        print(json.dumps(create(args.out),indent=2))
    except (ValueError,OSError) as error:
        print('make-fixtures: '+str(error),file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
