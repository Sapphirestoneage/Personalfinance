// Chase (S-243): credit cards (Freedom, Freedom Unlimited, Freedom Student, Amazon Prime Visa, Sapphire, Ink), Chase
// checking and savings, and J.P. Morgan Self-Directed Investing (brokerage and IRA). Only what differs from the
// generic words lives here; a new institution is another file like this one, listed once in profiles/index.js.

export const chase = {
  id: 'chase',
  name: 'Chase',
  // 1 when the statement is Chase's, else 0. Investing statements say J.P. Morgan.
  match: (text) => (/\bchase\b|jpmorgan chase|j\.?p\.? morgan/i.test(text) ? 1 : 0),
  institution: (text) => (/self-directed investing|j\.?p\.? morgan (?:wealth|securities|investing)/i.test(text) ? 'J.P. Morgan' : 'Chase'),
  // [words on the statement, the product's name, business card?]. The first match wins, so the longer names come first.
  products: [
    [/freedom unlimited/i, 'Freedom Unlimited'], [/freedom student/i, 'Freedom Student'], [/freedom flex/i, 'Freedom Flex'], [/freedom rise/i, 'Freedom Rise'], [/chase freedom|\bfreedom\b(?=[^\n]{0,20}(?:visa|card|rewards))/i, 'Freedom'],
    [/amazon (?:prime )?(?:rewards )?visa|prime visa|amazon\.com visa/i, 'Amazon Prime Visa'],
    [/sapphire preferred/i, 'Sapphire Preferred'], [/sapphire reserve/i, 'Sapphire Reserve'],
    [/ink business cash/i, 'Ink Business Cash', true], [/ink business unlimited/i, 'Ink Business Unlimited', true], [/ink business preferred/i, 'Ink Business Preferred', true], [/ink business premier/i, 'Ink Business Premier', true], [/\bink\b(?=[^\n]{0,20}(?:business|card))/i, 'Ink Business', true],
    [/slate edge/i, 'Slate Edge'], [/united (?:explorer|quest|club|gateway)/i, 'United'], [/southwest rapid rewards/i, 'Southwest Rapid Rewards'], [/marriott bonvoy/i, 'Marriott Bonvoy'], [/world of hyatt/i, 'World of Hyatt'], [/ihg one rewards/i, 'IHG One Rewards'], [/disney visa/i, 'Disney Visa'],
    [/chase total checking/i, 'Total Checking'], [/chase premier plus checking/i, 'Premier Plus Checking'], [/chase sapphire checking/i, 'Sapphire Checking'], [/chase private client checking/i, 'Private Client Checking'], [/chase college checking/i, 'College Checking'], [/chase secure banking/i, 'Secure Banking'], [/chase first banking/i, 'First Banking'],
    [/chase premier savings/i, 'Premier Savings'], [/chase savings/i, 'Chase Savings'],
    [/self-directed investing/i, 'Self-Directed Investing'], [/certificate of deposit|chase cd/i, 'Chase CD']
  ],
  // How points are valued: Amazon tracks percent back as points at 100 points to the dollar; Ultimate Rewards cash out at a cent a point.
  pointValue: () => 0.01,
  labels: {
    card: {
      limit: [/(?<!over (?:the )?)credit access line/i, /(?<!over (?:the )?)credit limit/i],
      overLimit: [/balance over the credit access line/i, /over the credit access line/i],
      autopayAmount: [/your next autopay payment for/i, /autopay payment for/i],
      autopayOn: [/your next autopay payment/i, /you have autopay/i],
      autopayOff: [/enroll in autopay/i, /sign up for autopay/i, /set up autopay/i],
      penaltyApr: [/penalty apr of/i, /up to the penalty apr of/i],
      lateFeeMax: [/late fee of up to/i],
      pointsPrevious: [/previous points balance/i],
      pointsAvailable: [/total points available for redemption/i],
      pointsRedeemed: [/points redeemed/i],
      rewardsHead: [/ultimate rewards/i, /amazon rewards/i, /rewards summary/i],
      sections: { payment: /payments and other credits/i, purchase: /^purchases?$/im, fee: /^fees charged$/im, interest: /^interest charged$/im, cashAdvance: /^cash advances$/im, transfer: /^balance transfers$/im }
    },
    bank: {
      deposits: [/deposits and additions/i],
      withdrawalParts: [/atm & debit card withdrawals/i, /electronic withdrawals/i, /checks paid/i, /other withdrawals/i],
      apy: [/annual percentage yield earned/i],
      interestPeriod: [/interest paid this period/i],
      interestYtd: [/interest paid year[- ]to[- ]date/i, /interest paid in \d{4}/i],
      sections: { deposit: /deposits and additions/i, withdrawal: /atm & debit card withdrawals|electronic withdrawals|checks paid|other withdrawals/i, fee: /^fees$/im }
    },
    investment: {
      beginning: [/beginning value/i, /beginning account value/i],
      ending: [/ending value/i, /ending account value/i],
      cashBalance: [/cash and sweep(?: funds?)?/i, /cash & sweep/i]
    }
  }
};
