/* Two Level 8 households (MR-045, MR-049). Maya (discovery) comes from one
   discovery call and nothing else; the variance household carries gut and
   dream anchors against real lines. The expected numbers live in
   tests/households/expected-discovery.py, typed from these facts by hand. */
export const MAYA_DISCOVERY = {
  snapshot: { name: 'Maya Lindqvist', birth: '2000-02-11', city: 'Jersey City', workSituation: 'employed', employerType: 'company', roommates: 1, roommateNames: ['Dani'], lease: 'both' },
  whyNow: 'A wedding next year and a card that never goes down. I want to stop guessing.',
  money: { gross: '68k', takeHome: '1900 every two weeks', contribPct: '4%', matchKnown: true, match: '',
    cash: [{ name: 'Savings', said: '2,500ish' }, { name: 'Venmo', said: '300' }, { name: 'Old credit union account', said: '40' }],
    invest: [{ name: '401k', said: 'will send', type: '401k' }],
    debt: [{ name: 'Credit card', said: 'not given', type: 'card' }] },
  spending: { gutTotal: '', areas: {}, phoneFamilyPlan: true },
  goals: [{ text: 'Credit card going down' }, { text: 'Know where the money goes' }, { text: 'Bachelorette in April', when: 'April' }, { text: 'Wedding next September', when: 'next September' }, { text: 'A cash cushion' }, { text: 'One trip paid in cash' }],
  mindset: { stuck: ['start', 'organization'], avoidsAccounts: true, struggles: ['avoiding', 'consistency'] },
  words: ['I just do not look at the card.', 'If I knew what I actually spend I think I would feel better.', 'Is 4% enough for the 401k?'],
};
/* The variance household: gut total low by about a fifth, two areas above gut, one below, one where the dream is above actual. */
export const VARIANCE_HOUSEHOLD = {
  birthDate: '1994-05-01', takeHome: 520000,
  gut: { 'spending:total': 240000, 'spending:food': 50000, 'spending:accommodation': 150000, 'spending:transportation': 30000, 'spending:wants': 30000, 'spending:utilities': 15000 },
  dream: { 'spending:food': 45000, 'spending:wants': 40000, 'spending:accommodation': 150000, 'life:fiAge': 50 },
  lines: [['Rent', 'accommodation', 150000], ['Groceries', 'food', 40000], ['Restaurants', 'food', 25000], ['Car', 'transportation', 45000], ['Fun', 'wants', 20000], ['Phone and internet', 'utilities', 15000]],
  invested: 3000000, cash: 800000,
};
