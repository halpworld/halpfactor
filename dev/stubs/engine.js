// Stub MathEngine: random facts from enabled tables, in-memory mastery.
export function makeEngine(log) {
  const facts = {};
  const mastery = new Array(13).fill(0);
  const pick = (settings) => {
    const tables = settings && settings.enabledTables && settings.enabledTables.length ? settings.enabledTables : [2, 5, 10];
    const a = tables[(Math.random() * tables.length) | 0];
    const b = 1 + ((Math.random() * 12) | 0);
    return Math.random() < 0.5 ? { a, b } : { a: b, b: a };
  };
  const engine = {
    forced: null, // harness can set { a, b, isPractice, mastered }
    record(a, b, correct, ms) {
      const k = `${Math.min(a, b)}x${Math.max(a, b)}`;
      const f = (facts[k] = facts[k] || { attempts: 0, correct: 0, mastery: 0 });
      f.attempts++;
      if (correct) f.correct++;
      f.mastery = f.correct / f.attempts;
      mastery[a] = Math.min(1, mastery[a] + (correct ? 0.1 : -0.05));
      mastery[b] = Math.min(1, mastery[b] + (correct ? 0.1 : -0.05));
      log && log(`engine.record(${a},${b},${correct},${Math.round(ms)})`);
    },
    async nextOrder(level, settings) {
      const f = engine.forced || { ...pick(settings), isPractice: Math.random() < 0.2 };
      engine.forced = null;
      return { a: f.a, b: f.b, target: f.a * f.b, isPractice: !!f.isPractice, mastered: !!f.mastered };
    },
    async nextSurge(level, settings) {
      return pick(settings);
    },
    async snapshot() {
      return { facts: { ...facts }, tableMastery: mastery.slice() };
    },
    tableMasteryCached(t) {
      return mastery[t] || 0;
    },
    reset() {
      for (const k of Object.keys(facts)) delete facts[k];
      mastery.fill(0);
      log && log('engine.reset()');
    },
  };
  return engine;
}
