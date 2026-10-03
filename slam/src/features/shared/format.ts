/* Display formatting. The only place cents become dollars. */
export function money(cents: number | null | undefined, opts: { sign?: boolean; whole?: boolean } = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 'not yet';
  const dollars = cents / 100;
  const s = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.whole ? 0 : 2,
    maximumFractionDigits: opts.whole ? 0 : 2,
  }).format(Math.abs(dollars));
  const neg = dollars < 0 ? '-' : opts.sign && dollars > 0 ? '+' : '';
  return neg + s;
}

export function count(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'not yet';
  return n.toFixed(digits).replace(/\.0+$/, '');
}

export function percent(rate: number | null | undefined, digits = 0): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return 'not yet';
  return `${(rate * 100).toFixed(digits)}%`;
}
