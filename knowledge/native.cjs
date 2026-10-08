'use strict';
const os = require('node:os');
const { MAX_MESSAGE, exact, uuid } = require('./core.cjs');
const { sync } = require('./github.cjs');
function frame(value) { const body = Buffer.from(JSON.stringify(value)); if (body.length > 64000) throw new Error('RESPONSE_TOO_LARGE'); const header = Buffer.alloc(4); os.endianness() === 'LE' ? header.writeUInt32LE(body.length) : header.writeUInt32BE(body.length); return Buffer.concat([header, body]); }
function decoder(onMessage, onError) {
  let buffer = Buffer.alloc(0), failed = false;
  return {
    push(chunk) {
      if (failed) return; buffer = Buffer.concat([buffer, chunk]);
      try {
        while (buffer.length >= 4) {
          const length = os.endianness() === 'LE' ? buffer.readUInt32LE() : buffer.readUInt32BE();
          if (length === 0 || length > MAX_MESSAGE) throw new Error('MESSAGE_TOO_LARGE');
          if (buffer.length < 4 + length) break;
          const body = buffer.subarray(4, length + 4); buffer = buffer.subarray(length + 4);
          onMessage(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)));
        }
      } catch { failed = true; onError(new Error('INVALID_FRAME')); }
    },
    end() { if (buffer.length && !failed) { failed = true; onError(new Error('TRUNCATED_FRAME')); } }
  };
}
async function handle(store, message) {
  exact(message, ['action', 'capture', 'operation_id']);
  if (message.action === 'save') { if (!message.capture || message.operation_id !== undefined) throw new Error('INVALID_MESSAGE'); return store.locked(async () => { const op = await store.stage(message.capture); return { state: op.state, durable: true, operation_id: op.input.operation_id }; }); }
  if (message.action === 'sync') { if (message.capture !== undefined || !uuid(message.operation_id)) throw new Error('INVALID_MESSAGE'); return sync(store, { operationId: message.operation_id }); }
  if (message.action === 'status') { if (message.capture !== undefined || message.operation_id !== undefined) throw new Error('INVALID_MESSAGE'); return store.locked(async () => { const ops = await store.operations(); return { configured: !!await store.config(), pending: ops.filter(o => o.state === 'pending').length, sent: ops.filter(o => o.state === 'sent').length }; }); }
  throw new Error('INVALID_ACTION');
}
async function runNative(store, origin) {
  const config = await store.config();
  // Origin registration is independent of KB destination: an unconfigured host can queue.
  const registration = require('./core.cjs'); const nativeConfig = await registration.read(require('node:path').join(store.root, 'native.json'));
  if (nativeConfig !== null) { exact(nativeConfig, ['extension_id']); if (!/^[a-p]{32}$/.test(nativeConfig.extension_id || '')) throw new Error('CORRUPT_LOCAL_STATE'); }
  const extensionId = nativeConfig?.extension_id || config?.extension_id;
  if (!/^[a-p]{32}$/.test(extensionId || '') || origin !== `chrome-extension://${extensionId}/`) throw new Error('ORIGIN_NOT_ALLOWED');
  let chain = Promise.resolve(); let bad = false; let queued = 0;
  const decode = decoder(message => { if (++queued > 4) { bad = true; process.stdin.destroy(); return; } chain = chain.then(async () => { try { process.stdout.write(frame(await handle(store, message))); } catch (e) { process.stdout.write(frame({ state: 'error', reason: /^(INVALID_|MESSAGE_|OPERATION_|CORRUPT_|LOCKED_)/.test(e.message) ? e.message : 'HOST_FAILED' })); } finally { queued--; } }); }, () => { bad = true; process.exitCode = 1; process.stdin.destroy(); });
  process.stdin.on('data', chunk => decode.push(chunk)); process.stdin.on('end', () => decode.end());
  await new Promise(resolve => process.stdin.on('close', resolve)); await chain; if (bad) process.exitCode = 1;
}
module.exports = { frame, decoder, handle, runNative };
