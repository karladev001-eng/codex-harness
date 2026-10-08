#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { Store, HOST, atomic, validateConfig } = require('./core.cjs');
const { sync } = require('./github.cjs');
const { runNative } = require('./native.cjs');
function flags(args) { const result = {}; for (let i = 0; i < args.length; i++) { if (!args[i].startsWith('--')) throw new Error('INVALID_ARGUMENT'); const key = args[i].slice(2); if (result[key] !== undefined) throw new Error('DUPLICATE_ARGUMENT'); result[key] = ['bind', 'install','quiet','force','publish'].includes(key) ? true : args[++i]; if (result[key] === undefined) throw new Error('MISSING_ARGUMENT'); } return result; }
async function register(store, options, environment = {}) {
  const extension = options.extension; const platform = options.platform || process.platform;
  if (!/^[a-p]{32}$/.test(extension || '') || !['darwin', 'win32'].includes(platform)) throw new Error('INVALID_REGISTRATION');
  const directory = path.resolve(options.output || path.join(store.root, 'host'));
  const node = path.resolve(options.node || process.execPath); const cli = path.resolve(__filename); const state = path.resolve(store.root);
  const values = [node, cli, state, directory]; if (values.some(v => /[\r\n\0]/.test(v)) || (platform === 'win32' && values.some(v => /[%!"&|<>^]/.test(v)))) throw new Error('UNSAFE_LAUNCHER_PATH');
  const launcher = path.join(directory, platform === 'win32' ? 'knowledge-host.cmd' : 'knowledge-host.sh');
  const manifest = path.join(directory, `${HOST}.json`); const native = path.join(store.root, 'native.json');
  const target = path.join(environment.home || os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts', `${HOST}.json`);
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST}`;
  const registry = environment.registry || ((args) => require('node:child_process').spawnSync('reg.exe', args, { windowsHide: true }));
  const phase = environment.phase || (async () => {});
  return store.locked(async () => {
    // Check the OS registration before touching any existing launcher, manifest or origin.
    if (options.install) {
      if (platform !== (environment.platform || process.platform)) throw new Error('INSTALL_PLATFORM_MISMATCH');
      if (platform === 'darwin') {
        try { await fs.lstat(target); throw new Error('EXISTING_REGISTRATION_MANUAL_REVIEW'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      } else {
        const previous = registry(['query', key]);
        if (previous.error || previous.status !== 1) throw new Error('EXISTING_OR_UNKNOWN_REGISTRATION');
      }
    }
    const backups = new Map();
    for (const file of [launcher, manifest, native]) {
      try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('UNSAFE_REGISTRATION_STATE'); backups.set(file, { bytes: await fs.readFile(file), mode: stat.mode }); }
      catch (e) { if (e.code !== 'ENOENT') throw e; backups.set(file, null); }
    }
    // A malformed saved origin must not be silently replaced by registration.
    const priorNative = await require('./core.cjs').read(native);
    if (priorNative !== null && (!/^[a-p]{32}$/.test(priorNative.extension_id || '') || Object.keys(priorNative).length !== 1)) throw new Error('CORRUPT_LOCAL_STATE');
    if (priorNative !== null && priorNative.extension_id !== extension) throw new Error('EXISTING_ORIGIN_MANUAL_REVIEW');
    let targetCreated = false;
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const sh = value => "'" + value.replace(/'/g, "'\\''") + "'";
      const script = platform === 'win32' ? `@echo off\r\nset "KNOWLEDGE_HOME=${state}"\r\n"${node}" "${cli}" native %*\r\n` : `#!/bin/sh\nexport KNOWLEDGE_HOME=${sh(state)}\nexec ${sh(node)} ${sh(cli)} native "$@"\n`;
      await fs.writeFile(launcher, script, { mode: 0o700 }); await fs.chmod(launcher, 0o700); await phase('launcher');
      await atomic(manifest, { name: HOST, description: 'Chrome knowledge capture', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extension}/`] }); await phase('manifest');
      await atomic(native, { extension_id: extension }); await phase('native');
      if (options.install) {
        await phase('before-install');
        if (platform === 'darwin') {
          await fs.mkdir(path.dirname(target), { recursive: true });
          // Exclusive create avoids overwriting a registration appearing after preflight.
          const handle = await fs.open(target, 'wx', 0o600); targetCreated = true;
          try { await handle.writeFile(await fs.readFile(manifest)); await handle.sync(); await phase('installed'); } finally { await handle.close(); }
        } else {
          // Repeat the preflight after preparing files; never force an existing key.
          const previous = registry(['query', key]); if (previous.error || previous.status !== 1) throw new Error('EXISTING_OR_UNKNOWN_REGISTRATION');
          const result = registry(['add', key, '/ve', '/t', 'REG_SZ', '/d', manifest]); if (result.error || result.status !== 0) throw new Error('REGISTRATION_FAILED');
        }
      }
      return { manifest, launcher, installed: !!options.install };
    } catch (error) {
      try {
        if (targetCreated) await fs.unlink(target);
        for (const [file, previous] of backups) {
          if (previous) { const temp = `${file}.${crypto.randomUUID()}.rollback`; await fs.writeFile(temp, previous.bytes, { mode: previous.mode }); await fs.rename(temp, file); await fs.chmod(file, previous.mode); }
          else await fs.rm(file, { force: true });
        }
      } catch { throw new Error('REGISTRATION_ROLLBACK_FAILED_MANUAL_INSPECTION'); }
      throw error;
    }
  });
}
async function main() {
  require('./process.cjs').installCancellation();
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('NODE_22_REQUIRED');
  const [command, ...args] = process.argv.slice(2);
  if (command === 'native') { await runNative(new Store(), args[0]); return; }
  const options = flags(args); if(options.state && (!path.isAbsolute(options.state)||/[\r\n\0]/.test(options.state)))throw new Error('STATE_ABSOLUTE_PATH_REQUIRED');
  const store = new Store(options.state); delete options.state; let result;
  const allowed = {configure:['repo','branch','library','gh','extension'],register:['extension','platform','output','node','install'],retry:['bind','operation'],status:[],pull:['force','quiet','interval'],search:['query','limit'],card:['capture'],read:['capture','field','offset','limit'],'export-image':['capture'],analyze:['codex','model','limit','capture','publish','timeout'],'publish-analysis':['limit'],hooks:['action','file','node','platform']}[command];
  if (allowed && Object.keys(options).some(key => !allowed.includes(key))) throw new Error('UNKNOWN_ARGUMENT');
  if (command === 'configure') {
    const previous = await store.config();
    const config = validateConfig({ schema_version: 1, repo: options.repo, branch: options.branch, library_id: options.library || previous?.library_id || crypto.randomUUID(), gh_path: options.gh, extension_id: options.extension });
    await store.locked(() => atomic(path.join(store.root, 'config.json'), config)); result = { configured: true, library_id: config.library_id };
  } else if (command === 'register') result = await register(store, options);
  else if (command === 'retry') result = await sync(store, { bind: options.bind === true, operationId: options.operation });
  else if (command === 'status') result = await store.locked(async () => ({ configured: !!await store.config(), operations: (await store.operations()).map(op => ({ operation_id: op.input.operation_id, state: op.state, destination: op.destination })) }));
  else if(command==='pull') result=await require('./reader.cjs').pull(store,{force:options.force===true,interval:options.interval===undefined?300:Number(options.interval),timeout:options.quiet?4000:20000,timeoutTotal:options.quiet?8500:60000});
  else if(command==='search') result=await require('./search.cjs').search(store,{query:options.query||'',limit:options.limit===undefined?10:Number(options.limit)});
  else if(command==='card') result=await require('./search.cjs').captureCard(store,{captureId:options.capture});
  else if(command==='read') result=await require('./retrieval.cjs').readCapture(store,{captureId:options.capture,field:options.field,offset:options.offset===undefined?0:Number(options.offset),limit:options.limit===undefined?4000:Number(options.limit)});
  else if(command==='export-image') result=await require('./retrieval.cjs').exportImage(store,{captureId:options.capture});
  else if(command==='hooks') result=await require('./hooks.cjs').hooks(store,options);
  else if(command==='analyze') {
    const {CodexProvider,analyze,publish}=require('./analysis.cjs');
    const limit=options.limit===undefined?5:Number(options.limit),provider=new CodexProvider(options.codex,options.model,{timeout:options.timeout===undefined?120000:Number(options.timeout)*1000});
    result={freshness:await require('./reader.cjs').pull(store,{force:true}),...await analyze(store,{provider,limit,captureId:options.capture})};
    if(options.publish)result.publish=await publish(store,{limit});
  } else if(command==='publish-analysis')result=await require('./analysis.cjs').publish(store,{limit:options.limit===undefined?5:Number(options.limit)});
  else throw new Error('Usage: knowledge configure|register|status|retry|pull|search|card|read|export-image|analyze|publish-analysis|hooks (see knowledge/README.md)');
  if(!options.quiet)process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (require.main === module) main().catch(e => { if(!process.argv.includes('--quiet'))process.stderr.write((process.argv[2] === 'native' ? 'KNOWLEDGE_HOST_FAILED' : e.message) + '\n'); process.exitCode = 1; });
module.exports = { main, register, flags };
