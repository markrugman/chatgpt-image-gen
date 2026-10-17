// Deterministic protocol fixture for storage/UI/failure tests, not image-quality proof.
import readline from 'node:readline';
import fs from 'node:fs';
import crypto from 'node:crypto';
const send = message => process.stdout.write(JSON.stringify(message) + '\n');
const reply = (id, result) => send({ id, result });
const event = (method, params) => send({ method, params });
const failed = new Set(), timers = new Map();
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line), p = request.params || {}, method = request.method;
  if (!request.id) return;
  if (method === 'initialize') return reply(request.id, {});
  if (method === 'account/read') return reply(request.id, { account: { type: 'chatgpt' } });
  if (method === 'modelProvider/capabilities/read') return reply(request.id, { imageGeneration: true });
  if (method === 'thread/start') return reply(request.id, { thread: { id: crypto.randomUUID() } });
  if (method === 'turn/interrupt') {
    clearTimeout(timers.get(p.threadId)); reply(request.id, {});
    return event('turn/completed', { threadId: p.threadId, turn: { id: p.turnId, status: 'interrupted' } });
  }
  if (method === 'turn/start') {
    fs.appendFileSync(process.env.ANNOTATION_RUNTIME_LOG, JSON.stringify(p) + '\n');
    const turnId = crypto.randomUUID(); reply(request.id, { turn: { id: turnId } });
    const text = p.input.filter(i => i.type === 'text').map(i => i.text).join('\n');
    const source = p.input.find(i => i.type === 'localImage');
    timers.set(p.threadId, setTimeout(() => {
      if (text.includes('FAIL_ONCE') && !failed.has(source.path)) {
        failed.add(source.path);
        return event('turn/completed', { threadId: p.threadId, turn: { id: turnId, status: 'failed', error: { message: 'Intentional fixture failure' } } });
      }
      event('item/completed', { threadId: p.threadId, item: { type: 'imageGeneration', status: 'completed', savedPath: source.path } });
      event('turn/completed', { threadId: p.threadId, turn: { id: turnId, status: 'completed' } });
    }, text.includes('SLOW') ? 6000 : 300));
    return;
  }
  reply(request.id, {});
});
