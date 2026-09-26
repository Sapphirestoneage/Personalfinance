# Parnassah, the spec (short; the pages and engines carry their own comments)

## 1. Who it is for

A Modern Orthodox household in the United States: two earners as often as
not, several children in day school, a shul to walk to, a year of tzedakah
to give, and simchas that land in years you can name today. The general
planning tools carry none of those lines. This site carries only those, and
then adds them to what is left.

## 2. The lines it carries

1. **Tuition.** Early childhood, K to 8, high school, the year in Israel,
   for every child, every school year, with the committee's reduction and
   the sibling rule.
2. **The year.** Shul dues, High Holiday seats, Sukkot, the Tishrei meals,
   Chanukah, Purim, Pesach, Shavuot, the mikvah, the eruv, an Israel trip;
   the Shabbat table every week; camp per child.
3. **Tzedakah.** A tenth (or a fifth, or the family's own share) of gross or
   after-tax income; what was given, by kind; the pace to Elul.
4. **Simchas.** Bar and bat mitzvahs, the year in Israel, weddings at a
   named share convention, the years of support, aliyah.
5. **The home.** Price, down payment, rate, term, tax, insurance; the share
   of take-home alone and with tuition; the price that fits.
6. **The picture.** Take-home less the five above and retirement; the
   checklist; the tuition years beside retirement; the freed tuition.

## 3. The rules

- No real data. The example family is fictional; backups are refused by git.
- Empty is not zero. A blank box is not entered. An engine returns
  `incomplete` with a reason and the missing paths, never a guessed number.
  Where a reference band stands in for a family figure, it is marked
  `assumed` everywhere it shows.
- Money is integer cents; rates are decimal fractions; display rounds.
- One formula, one function: every figure on every page comes from one of
  the six engines, and the picture composes them rather than recomputing.
- Reference data is dated, with a confidence and a source, in `data/`.
- The form is built once; read-outs repaint after a save.
- Nothing leaves the device. No account, no server, no network request; the
  Content Security Policy on every page enforces it.
- Not advice. The site does the arithmetic so the conversation with a rav, a
  preparer and a lawyer starts from a number.

## 4. The selling layer

The site exists to sell the coaching; the tools are the draw. Five pages
carry the selling (landing, coaching, about, resources, book) and every tool
page ends in the band that books a call. Every word of those pages, every
price and the booking link live in `data/site.json`, so the coach edits them
without touching a page. Nothing is invented: unknown facts are `[edit:]`
placeholders the tests list, and a testimonial appears only once a real one
is added to `proof`.

## 5. Not built

- A monthly close or a log of what was actually spent (SPARKS does that).
- A tax estimate from gross; the family types take-home and the year's tax.
- 529 growth or state deduction arithmetic; the rule is named, not modelled.
- The Hebrew calendar itself; events sit in their usual civil month.
