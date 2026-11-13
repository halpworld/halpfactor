// Module Web Worker hosting a MasteryTracker.
//
// In: {type:'init', data} | {type:'record', a,b,correct,responseTimeMs,now}
//     | {type:'next', id, kind:'order'|'surge', tables, recentKeys} | {type:'snapshot', id} | {type:'reset'}
// Out: {type:'ready'}                         (after init; used for the engine's handshake)
//      {type:'state', data, tableMastery}     (after every record/reset; main persists `data`)
//      {type:'next', id, a, b, isPractice}
//      {type:'snapshot', id, facts, tableMastery}
//
// The message handler is exported as createHandler() so the engine can run the very same code
// in-thread when a Worker is unavailable.

import { MasteryTracker, pickFact } from './mastery.js';

export function createHandler(post) {
  let tracker = new MasteryTracker();

  const sendState = () => {
    post({ type: 'state', data: tracker.serialize(), tableMastery: tracker.tableMasteries() });
  };

  return function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    try {
      switch (msg.type) {
        case 'init':
          tracker = new MasteryTracker(msg.data);
          post({ type: 'ready' });
          break;
        case 'record':
          tracker.record(msg.a, msg.b, {
            correct: msg.correct,
            responseTimeMs: msg.responseTimeMs,
            now: msg.now,
          });
          sendState();
          break;
        case 'next': {
          const pick = pickFact(tracker, msg.tables, {
            recentKeys: msg.recentKeys,
            surge: msg.kind === 'surge',
          });
          post({ type: 'next', id: msg.id, a: pick.a, b: pick.b, isPractice: pick.isPractice });
          break;
        }
        case 'snapshot': {
          const snap = tracker.snapshot();
          post({ type: 'snapshot', id: msg.id, facts: snap.facts, tableMastery: snap.tableMastery });
          break;
        }
        case 'reset':
          tracker = new MasteryTracker();
          sendState();
          break;
        default:
          break;
      }
    } catch (err) {
      post({ type: 'error', id: msg.id, message: String(err && err.message ? err.message : err) });
    }
  };
}

// Register only when actually running as a dedicated worker.
if (
  typeof WorkerGlobalScope !== 'undefined' &&
  typeof self !== 'undefined' &&
  self instanceof WorkerGlobalScope
) {
  const handle = createHandler((m) => self.postMessage(m));
  self.onmessage = (e) => handle(e.data);
}
