const crypto = require('node:crypto');
const lib = require('../dist/skill/lib.js');
const { RemoteError } = require('../dist/skill/records.js');
function server() {
  const files = new Map(), calls = []; let failure = null, lose = false;
  const hash = content => crypto.createHash('sha1').update(content).digest('hex');
  const set = (file, content) => files.set(file, { content, sha: hash(content) });
  const transport = (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (failure) throw new RemoteError(failure);
    if (endpoint.includes('/branches/')) return { name: 'main' };
    if (!endpoint.includes('/contents/')) return { private: true };
    const file = endpoint.split('/contents/')[1].split('?')[0], current = files.get(file);
    if (method === 'GET') {
      const children = [...files.keys()].filter(key => key.startsWith(file + '/') && !key.slice(file.length + 1).includes('/'));
      if (children.length) return children.map(key => ({ name: key.slice(file.length + 1), path: key, type: 'file' }));
      if (!current) throw new RemoteError('not_found_or_inaccessible');
      return { type: 'file', encoding: 'base64', sha: current.sha, content: Buffer.from(current.content).toString('base64') };
    }
    if ((body.sha || null) !== (current?.sha || null)) throw new RemoteError('conflict');
    if (method === 'DELETE') files.delete(file); else set(file, Buffer.from(body.content, 'base64').toString('utf8'));
    if (lose) { lose = false; throw new RemoteError('unavailable'); }
    return { content: method === 'DELETE' ? null : { sha: files.get(file).sha }, commit: { sha: hash(JSON.stringify(body)) } };
  };
  return { files, calls, transport, set, puts: () => calls.filter(call => call.method === 'PUT'), fail: value => { failure = value; }, lose: () => { lose = true; } };
}
function automatic() { const config = structuredClone(lib.DEFAULTS); config.preferences.repository = 'owner/private-kb'; config.preferences.autosave = true; return config; }
function explicit() { const config = structuredClone(lib.DEFAULTS); config.preferences.repository = 'owner/private-kb'; config.preferences.project_key = 'stable'; return config; }
module.exports = { server, automatic, explicit };
