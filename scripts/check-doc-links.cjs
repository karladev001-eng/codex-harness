const fs = require('node:fs');
const path = require('node:path');
const { currentDocuments, walk, links } = require('./public-docs.cjs');
function anchors(text) {
  const ids = new Set([...text.matchAll(/<a\s+id=["']([^"']+)["']/g)].map(match => match[1]));
  const seen = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[`*_~]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/ /g, '-');
    const count = seen.get(base) || 0; seen.set(base, count + 1); ids.add(base + (count ? '-' + count : ''));
  }
  return ids;
}
function check(root, options = {}) {
  root = path.resolve(root);
  const roots = options.skillOnly ? [] : currentDocuments(root).map(file => path.join(root, file));
  const skillRoots = options.skillOnly ? [root] : ['dist/skill', 'dist/plugins/codex-harness/skills/harness'].map(file => path.join(root, file)).filter(file => fs.existsSync(file));
  for (const skill of skillRoots) roots.push(...walk(skill).filter(file => file.endsWith('.md') && !/[/\\]documentation[/\\]docs[/\\](?:adr|history)[/\\]/.test(file)));
  if (!options.skillOnly) {
    roots.push(...walk(path.join(root, 'authoring-skills')).filter(file => file.endsWith('.md')),
      ...walk(path.join(root, 'plugins/codex-harness/skills/harness')).filter(file => file.endsWith('.md')));
    for (const file of ['dist/knowledge/README.md', 'dist/knowledge/extension/README.md']) if (fs.existsSync(path.join(root, file))) roots.push(path.join(root, file));
  }
  let count = 0; const errors = [];
  for (const file of new Set(roots)) {
    if (!fs.existsSync(file)) { errors.push(path.relative(root, file) + ': missing document'); continue; }
    for (const href of links(fs.readFileSync(file, 'utf8'))) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) continue;
      count++;
      const [targetPath, fragment] = href.split('#');
      const target = targetPath ? path.resolve(path.dirname(file), decodeURIComponent(targetPath)) : file;
      if (!fs.existsSync(target)) errors.push(path.relative(root, file) + ': missing ' + href);
      else if (fragment && target.endsWith('.md') && !anchors(fs.readFileSync(target, 'utf8')).has(decodeURIComponent(fragment))) errors.push(path.relative(root, file) + ': missing anchor ' + href);
    }
  }
  return { documents: new Set(roots).size, links: count, errors };
}
if (require.main === module) {
  const result = check(process.argv[2] || path.resolve(__dirname, '..'));
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.errors.length ? 1 : 0;
}
module.exports = { check };
