import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/pack.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = process.env.PYTHON || 'python3';
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
function py(script,args=[],ok=true,input) {
  const result=spawnSync(PYTHON,[script,...args],{encoding:'utf8',maxBuffer:12*1024*1024,input});
  if(ok) assert.equal(result.status,0,result.stderr || result.error?.message);
  else assert.notEqual(result.status,0,'Malformed input should be refused');
  return result;
}
async function area(fn) { const tmp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'slide-master-test-')));try { await fn(tmp); } finally { await fs.rm(tmp,{recursive:true,force:true}); } }
const mutateCode = `import sys,json,zipfile,base64,stat
source,out=sys.argv[1:]
encoded=sys.stdin.read()
options=json.loads(encoded)
with zipfile.ZipFile(source) as z: parts={n:z.read(n) for n in z.namelist()}
for name,content in options.get('replace',{}).items(): parts[name]=base64.b64decode(content)
for name in options.get('remove',[]): parts.pop(name,None)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for name,data in parts.items():
  i=zipfile.ZipInfo(name);i.compress_type=zipfile.ZIP_DEFLATED
  if name==options.get('symlink'): i.external_attr=(stat.S_IFLNK|0o777)<<16
  z.writestr(i,data)
 if options.get('duplicate'): z.writestr(options['duplicate'],parts[options['duplicate']])
`;
function mutate(source,out,options) { return py('-c',[mutateCode,source,out],true,JSON.stringify(options)); }
const b64=s=>Buffer.from(s).toString('base64');
async function fixtures(tmp) { const out=path.join(tmp,'fixtures');py(path.join(ROOT,'scripts/make-fixtures.py'),['--out',out]);return out; }
const inspect=(input,args=[],ok=true)=>py(path.join(ROOT,'scripts/inspect-master.py'),[input,...args],ok);

test('independent 4:3 and 16:9 source structures map into real HTML output',async()=>area(async tmp=>{
  const source=await fixtures(tmp);
  for(const [name,ratio,height] of [['standard-4x3',[4,3],6858000],['wide-16x9',[16,9],5143500]]) {
    const root=path.join(source,name), original=path.join(root,'references',name+'.pptx');
    const before=await fs.readFile(original), report=JSON.parse(inspect(original).stdout);
    assert.equal(report.input.sha256,digest(before));assert.equal(report.input.originalChanged,false);
    assert.deepEqual(report.page.ratio,ratio);assert.equal(report.page.widthEmu,9144000);assert.equal(report.page.heightEmu,height);
    assert.equal(report.masters.length,1);assert.equal(report.layouts.length,1);assert.equal(report.slides.length,1);
    assert.equal(report.masters[0].part,'ppt/slideMasters/slideMaster1.xml');
    assert.deepEqual(report.masters[0].shapes[0].placeholder,{type:'title',idx:'2'});
    assert.deepEqual(report.masters[0].shapes[0].geometry.percent,{x:8,y:10,width:76,height:15});
    assert.equal(report.mapping.themeSuggestion.background,'#f8fafc');assert.equal(report.mapping.themeSuggestion.ink,'#182c46');assert.equal(report.mapping.themeSuggestion.accent,'#c54163');
    assert.equal(report.themes[0].fonts.majorFont[0].typeface,'Arial');
    assert.equal(report.renderStatus.status,'unverified');assert.equal(report.mapping.status,'proposed-not-applied');assert.equal(report.mapping.logoCandidates[0].confirmed,false);
    assert.equal(report.mapping.logoCandidates[0].image.sha256,digest(await fs.readFile(path.join(root,'assets/logo.png'))));
    const deck=JSON.parse(await fs.readFile(path.join(root,'deck.json'),'utf8'));
    for(const key of ['background','ink','accent','muted','font','ratio']) assert.deepEqual(deck.design.themes[0][key],report.mapping.themeSuggestion[key]);
    // Compare OOXML, recorded mapping and the actual runtime output, rather than a mock renderer.
    const output=await build(path.join(root,'deck.json'),path.join(tmp,'html-'+name));
    const html=await fs.readFile(path.join(output.directory,'A/output/slides.html'),'utf8');
    for(const [role,box] of Object.entries(deck.master.design.geometry)) {
      const sourceShape=report.masters[0].shapes.find(s=>role==='logo'?s.kind==='pic':s.placeholder?.type=== (role==='title'?'title':'body'));
      for(const key of ['x','y','width','height']) assert.ok(Math.abs(box[key]-sourceShape.geometry.percent[key])<=0.001,`${role}.${key} geometry differs`);
      assert.ok(html.includes(`left:${box.x}%;top:${box.y}%;width:${box.width}%;height:${box.height}%`),`${role} HTML rectangle missing`);
    }
    assert.ok(html.includes(`--ratio:${ratio[0]}/${ratio[1]}`));
    for(const color of Object.values(deck.master.design.colors)) assert.ok(html.includes(color));
    assert.equal(digest(await fs.readFile(path.join(output.directory,'A/assets/logo.png'))),report.mapping.logoCandidates[0].image.sha256);
    assert.equal(digest(await fs.readFile(original)),digest(before),'Inspector/build must preserve original bytes');
    const template=JSON.parse(inspect(path.join(root,'references',name+'.potx')).stdout);assert.equal(template.input.format,'potx');
  }
}));

test('JSON report/output collisions and fresh-fixture output preserve prior data',async()=>area(async tmp=>{
  const generated=await fixtures(tmp), input=path.join(generated,'standard-4x3/references/standard-4x3.pptx');
  const out=path.join(tmp,'report.json');const report=inspect(input,['--out',out]);assert.deepEqual(JSON.parse(await fs.readFile(out,'utf8')),JSON.parse(report.stdout));
  const original=await fs.readFile(input), old=await fs.readFile(out);
  assert.match(inspect(input,['--out',out],false).stderr,/exist/i);assert.deepEqual(await fs.readFile(out),old);
  assert.match(inspect(input,['--out',input],false).stderr,/overlaps input/);assert.deepEqual(await fs.readFile(input),original);
  await fs.symlink(input,path.join(tmp,'link.json'));assert.match(inspect(input,['--out',path.join(tmp,'link.json')],false).stderr,/exist|overlaps/i);
  await fs.symlink(tmp,path.join(tmp,'parent-link'));assert.match(inspect(input,['--out',path.join(tmp,'parent-link/new.json')],false).stderr,/symlink/i);
  assert.notEqual(py(path.join(ROOT,'scripts/make-fixtures.py'),['--out',generated],false).status,0);
  assert.deepEqual(await fs.readFile(input),original);
  const second=path.join(tmp,'other');py(path.join(ROOT,'scripts/make-fixtures.py'),['--out',second]);
  assert.deepEqual(await fs.readFile(path.join(second,'standard-4x3/references/standard-4x3.pptx')),original,'Fixtures should be byte-deterministic');
}));

test('malformed archives, unsafe ZIP paths, duplicate entries, symlinks, DTD and expansion are refused',async()=>area(async tmp=>{
  const generated=await fixtures(tmp), source=path.join(generated,'wide-16x9/references/wide-16x9.pptx');
  const cases=[
    ['traversal',{replace:{'../outside.xml':b64('<x/>')}},/Unsafe ZIP/],
    ['absolute',{replace:{'/outside.xml':b64('<x/>')}},/Unsafe ZIP/],
    ['duplicate',{duplicate:'ppt/presentation.xml'},/Duplicate ZIP/],
    ['symlink',{symlink:'ppt/media/logo.png'},/symlink/],
    ['dtd',{replace:{'ppt/unused.xml':b64('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')}},/DTD\/entities/],
    ['utf16',{replace:{'ppt/unused.xml':Buffer.from('<!DOCTYPE x [<!ENTITY e "hidden">]><x>&e;</x>','utf16le').toString('base64')}},/UTF-8/],
    ['expansion',{replace:{'ppt/unused.xml':b64('<x>'+ 'a'.repeat(2*1024*1024)+'</x>')}},/compression ratio/],
    ['missing',{remove:['ppt/media/logo.png']},/Missing relationship target/],
    ['deepxml',{replace:{'ppt/unused.xml':b64('<x>'.repeat(130)+'</x>'.repeat(130))}},/nesting limit/],
    ['badxml',{replace:{'ppt/unused.xml':b64('<x>')}},/no element found/],
    ['escape-rel',{replace:{'ppt/_rels/presentation.xml.rels':b64('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+ 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster' +'" Target="../../escape.xml"/></Relationships>')}},/Unsafe ZIP/]
  ];
  for(const [name,options,message] of cases) { const input=path.join(tmp,name+'.pptx');mutate(source,input,options);const result=inspect(input,[],false);assert.match(result.stderr,message,name);assert.equal(result.stdout,'',name+' should not return a successful report'); }
  const renamed=path.join(tmp,'renamed.potx');await fs.copyFile(source,renamed);assert.match(inspect(renamed,[],false).stderr,/renaming is not conversion/);
  const broken=path.join(tmp,'broken.pptx');await fs.writeFile(broken,'not a zip');assert.match(inspect(broken,[],false).stderr,/zip/i);
}));

test('external relationships are reported and never dereferenced',async()=>area(async tmp=>{
  const generated=await fixtures(tmp), source=path.join(generated,'wide-16x9/references/wide-16x9.pptx');
  const input=path.join(tmp,'external.pptx');mutate(source,input,{replace:{'ppt/slides/_rels/slide1.xml.rels':b64('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="file:///nonexistent/private-data.png" TargetMode="External"/></Relationships>')}});
  const report=JSON.parse(inspect(input).stdout);assert.ok(report.warnings.some(w=>w.includes('never fetched')));assert.equal(report.slides[0].relationships.find(r=>r.id==='external').part,null);
}));
