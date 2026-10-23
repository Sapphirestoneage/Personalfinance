/* Shims for the vendored cashcal.js (S-203). The level-payment formula is the vendored
   original. The other six names are Money Rooms record helpers used only by
   buildModel, setCalendar and spendPace, which SLAM never calls: each throws so a
   stray call is loud, never a silent zero. */
export { levelPayment } from './loanmath.js';
const notVendored = (name) => () => { throw new Error(name + ' is a Money Rooms record helper; SLAM builds the calendar model in engine/cashsim.js'); };
export const hasValue = notVendored('hasValue');
export const numberOf = notVendored('numberOf');
export const setSection = notVendored('setSection');
export const monthlyOf = notVendored('monthlyOf');
export const paychecksPerYear = notVendored('paychecksPerYear');
export const shareOf = notVendored('shareOf');
export const isQ = notVendored('isQ');
