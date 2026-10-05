/* The screens, households and widths the sweep covers. Grows with the levels. */
export const WIDTHS = [1440, 1024, 390];

export const SCREENS = [
  { id: 'home', route: 'home' },
];

/* Each household knows how to load itself into the page. */
export const HOUSEHOLDS = [
  {
    id: 'empty',
    async load(page) {
      await page.fill('input[aria-label="New client name"]', 'Example household');
      await page.click('text=New client');
      await page.waitForSelector('.fieldrow[data-field="name"]');
    },
  },
];
