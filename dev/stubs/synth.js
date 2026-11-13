// Stub Synth: records every call so the harness can show which sounds fired.
export function makeSynth(log) {
  const calls = [];
  const synth = new Proxy(
    { calls, sfxOn: true, ambientOn: true },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (...args) => {
          calls.push(String(prop));
          if (prop !== 'unlock' && prop !== 'tick') log && log(`synth.${String(prop)}(${args.join(',')})`);
        };
      },
    },
  );
  return synth;
}
