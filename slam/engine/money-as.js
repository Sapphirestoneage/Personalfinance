// What an amount costs in other terms (Preferences, "Show money as"): hours of work at the real hourly wage, or days
// of FI pushed later at today's saving pace (one day of FI later = one day of what is saved now). Null when the
// number it needs is missing, so a screen shows dollars alone rather than a made-up figure.

const DAYS_PER_MONTH = 365.25 / 12;
export const hoursOf = (amount, wage) => (amount === null || amount === undefined || !wage ? null : Math.round(amount / wage * 10) / 10);
export const savedPerDay = (savedPerMonth) => (savedPerMonth === null || savedPerMonth === undefined || savedPerMonth <= 0 ? null : savedPerMonth / DAYS_PER_MONTH);
export const fiDaysOf = (amount, perDay) => (amount === null || amount === undefined || !perDay ? null : Math.round(amount / perDay));
