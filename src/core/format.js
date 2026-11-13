// Number formatting shared by canvas and DOM (tycoon-style short numbers).

const UNITS = [
  { v: 1e12, s: 'T' },
  { v: 1e9, s: 'B' },
  { v: 1e6, s: 'M' },
  { v: 1e3, s: 'K' },
];

/** 999 -> "999", 1234 -> "1.2K", 12345 -> "12.3K", 123456 -> "123K", 2.5e6 -> "2.5M". */
export function formatBolts(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  n = Math.floor(Math.abs(n));
  if (n < 1000) return sign + String(n);
  for (const u of UNITS) {
    if (n >= u.v) {
      const x = n / u.v;
      // Truncate (never round up), so "1.0K" is never shown for 999 and costs never look cheaper.
      const str = x >= 100 ? String(Math.floor(x)) : (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
      return sign + str + u.s;
    }
  }
  return sign + String(n);
}

/** Percent bonus for display: 0.25 -> "+25%". */
export function formatBoost(frac) {
  const p = Math.round((Number(frac) || 0) * 100);
  return (p >= 0 ? '+' : '') + p + '%';
}
