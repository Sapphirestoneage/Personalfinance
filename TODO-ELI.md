# TODO-ELI.md — what only Eli can fill in

Every `{{…}}` placeholder on stresslessaboutmoney.com, where it appears, and
the handful of judgment calls the build made on your behalf. `node
test/site.js` fails if a placeholder on the site is missing from this file,
or if this file lists one that is gone, so it stays true.

A placeholder renders on the page as a dashed chip so it cannot be mistaken
for finished copy. Replace the whole `{{…}}` token, chip included
(`<mark class="ph">{{…}}</mark>` → your text). Links and forms whose
destination is still a placeholder are stopped by `site.js` with a note
instead of 404ing.

## Facts and links

| Placeholder | Where | What goes there |
|---|---|---|
| `{{CLIENT_COUNT}}` | `index.html` (How I got here), `about/index.html` (prose and credentials) | The true number of people coached |
| `{{BOOKING_URL}}` | `coaching/index.html` — the "Pick a time" button | Your existing calendar link |
| `{{BOOKING_PROVIDER_NAME}}` | `privacy/index.html` | The name of the calendar service, for its privacy line |
| `{{BP_MONEY_EPISODE_URL}}` | `media/index.html`, and the Person JSON-LD `sameAs` on `index.html` and `about/index.html` | The BiggerPockets Money episode |
| `{{CHOOSEFI_LINK}}` | `media/index.html`, and the same JSON-LD | The ChooseFI page or episode |
| `{{CONTACT_EMAIL}}` | `media/index.html` ("Talk to your group"), `privacy/index.html`, `terms/index.html` | The address you want mail at |
| `{{HEADSHOT}}` | `about/index.html` sidebar | Replace the whole `<div class="photo">…</div>` with `<div class="photo"><img src="../site/eli.jpg" alt="Eli Saperstein" width="240" height="300" loading="lazy"/></div>`. Any size, 4:5 crop looks right |
| `{{OG_IMAGE_URL}}` | the `og:image` tag on every page | An absolute URL to a 1200×630 image (e.g. `https://stresslessaboutmoney.com/site/og.png`). One image for the whole site is fine |

## Offers

| Placeholder | Where | What goes there |
|---|---|---|
| `{{CLARITY_PRICE}}` | `coaching/index.html`, and the `priceRange` in ProfessionalService JSON-LD on `index.html` and `coaching/index.html` | Price of the Clarity Package |
| `{{CLARITY_DESCRIPTION}}` | `coaching/index.html` | One or two sentences after "For 'I'm fine but stuck.'" |
| `{{CLARITY_INCLUDES}}` | `coaching/index.html` | What's included |
| `{{SORTED_PRICE}}` | `coaching/index.html`, same JSON-LD | Price of the Sorted Blueprint |
| `{{SORTED_DESCRIPTION}}` | `coaching/index.html` | One or two sentences after the tangled-situations line |
| `{{SORTED_INCLUDES}}` | `coaching/index.html` | What's included |

## Email list

| Placeholder | Where | What goes there |
|---|---|---|
| `{{EMAIL_PROVIDER_ACTION_URL}}` | the form on `notes/index.html` and each of the three posts under `notes/` | The provider's form action. Buttondown and ConvertKit examples are in the HTML comment beside the form; ConvertKit also needs the input renamed `email_address` |
| `{{EMAIL_PROVIDER_NAME}}` | `privacy/index.html` | "Buttondown" or "ConvertKit" |

## Frameworks — `frameworks/<slug>/index.html`, ten pages, four placeholders each

You said you would supply the definitions, so nothing on these pages is
inferred. For each of SWAN Number, Rule of Five, DRAFTT, Return on Hassle,
the Convenience Method, the Second Mouse Framework, the FI Address,
FI-losophy, the Avalanche Generation and the Triple D Plan:

| Placeholder | What goes there |
|---|---|
| `{{FRAMEWORK_DEFINITION_<NAME>}}` | The one-sentence definition (the page's lead line) |
| `{{FRAMEWORK_SITUATION_<NAME>}}` | The situation it's for |
| `{{FRAMEWORK_UNLEARN_<NAME>}}` | The piece of common advice it replaces at this stage |
| `{{FRAMEWORK_ORDER_<NAME>}}` | "Money order" or "skill order" — which of your two orders it belongs to |

Every token, page by page:

| Page | Tokens |
|---|---|
| `frameworks/swan-number/` | `{{FRAMEWORK_DEFINITION_SWAN_NUMBER}}` · `{{FRAMEWORK_SITUATION_SWAN_NUMBER}}` · `{{FRAMEWORK_UNLEARN_SWAN_NUMBER}}` · `{{FRAMEWORK_ORDER_SWAN_NUMBER}}` |
| `frameworks/rule-of-five/` | `{{FRAMEWORK_DEFINITION_RULE_OF_FIVE}}` · `{{FRAMEWORK_SITUATION_RULE_OF_FIVE}}` · `{{FRAMEWORK_UNLEARN_RULE_OF_FIVE}}` · `{{FRAMEWORK_ORDER_RULE_OF_FIVE}}` |
| `frameworks/draftt/` | `{{FRAMEWORK_DEFINITION_DRAFTT}}` · `{{FRAMEWORK_SITUATION_DRAFTT}}` · `{{FRAMEWORK_UNLEARN_DRAFTT}}` · `{{FRAMEWORK_ORDER_DRAFTT}}` |
| `frameworks/return-on-hassle/` | `{{FRAMEWORK_DEFINITION_RETURN_ON_HASSLE}}` · `{{FRAMEWORK_SITUATION_RETURN_ON_HASSLE}}` · `{{FRAMEWORK_UNLEARN_RETURN_ON_HASSLE}}` · `{{FRAMEWORK_ORDER_RETURN_ON_HASSLE}}` |
| `frameworks/the-convenience-method/` | `{{FRAMEWORK_DEFINITION_THE_CONVENIENCE_METHOD}}` · `{{FRAMEWORK_SITUATION_THE_CONVENIENCE_METHOD}}` · `{{FRAMEWORK_UNLEARN_THE_CONVENIENCE_METHOD}}` · `{{FRAMEWORK_ORDER_THE_CONVENIENCE_METHOD}}` |
| `frameworks/the-second-mouse-framework/` | `{{FRAMEWORK_DEFINITION_THE_SECOND_MOUSE_FRAMEWORK}}` · `{{FRAMEWORK_SITUATION_THE_SECOND_MOUSE_FRAMEWORK}}` · `{{FRAMEWORK_UNLEARN_THE_SECOND_MOUSE_FRAMEWORK}}` · `{{FRAMEWORK_ORDER_THE_SECOND_MOUSE_FRAMEWORK}}` |
| `frameworks/the-fi-address/` | `{{FRAMEWORK_DEFINITION_THE_FI_ADDRESS}}` · `{{FRAMEWORK_SITUATION_THE_FI_ADDRESS}}` · `{{FRAMEWORK_UNLEARN_THE_FI_ADDRESS}}` · `{{FRAMEWORK_ORDER_THE_FI_ADDRESS}}` |
| `frameworks/fi-losophy/` | `{{FRAMEWORK_DEFINITION_FI_LOSOPHY}}` · `{{FRAMEWORK_SITUATION_FI_LOSOPHY}}` · `{{FRAMEWORK_UNLEARN_FI_LOSOPHY}}` · `{{FRAMEWORK_ORDER_FI_LOSOPHY}}` |
| `frameworks/the-avalanche-generation/` | `{{FRAMEWORK_DEFINITION_THE_AVALANCHE_GENERATION}}` · `{{FRAMEWORK_SITUATION_THE_AVALANCHE_GENERATION}}` · `{{FRAMEWORK_UNLEARN_THE_AVALANCHE_GENERATION}}` · `{{FRAMEWORK_ORDER_THE_AVALANCHE_GENERATION}}` |
| `frameworks/the-triple-d-plan/` | `{{FRAMEWORK_DEFINITION_THE_TRIPLE_D_PLAN}}` · `{{FRAMEWORK_SITUATION_THE_TRIPLE_D_PLAN}}` · `{{FRAMEWORK_UNLEARN_THE_TRIPLE_D_PLAN}}` · `{{FRAMEWORK_ORDER_THE_TRIPLE_D_PLAN}}` |

Five pages also need a worked example, because no room in the repo runs
them and I would have had to invent one:

| Placeholder | Page |
|---|---|
| `{{FRAMEWORK_EXAMPLE_DRAFTT}}` | `frameworks/draftt/` |
| `{{FRAMEWORK_EXAMPLE_THE_SECOND_MOUSE_FRAMEWORK}}` | `frameworks/the-second-mouse-framework/` |
| `{{FRAMEWORK_EXAMPLE_THE_FI_ADDRESS}}` | `frameworks/the-fi-address/` |
| `{{FRAMEWORK_EXAMPLE_FI_LOSOPHY}}` | `frameworks/fi-losophy/` |
| `{{FRAMEWORK_EXAMPLE_THE_AVALANCHE_GENERATION}}` | `frameworks/the-avalanche-generation/` |

The other five (SWAN Number, Rule of Five, Return on Hassle, the Convenience
Method, the Triple D Plan) already carry a worked example written from how
the room implements them. Read those five and correct anything that isn't
how you'd say it.

## Notes — `notes/`

| Placeholder | Where |
|---|---|
| `{{NOTE_1_DATE}}`, `{{NOTE_1_BODY}}` | "Why the first look is the whole job" — `notes/why-the-first-look-is-the-whole-job/` (date also on `notes/index.html`) |
| `{{NOTE_2_DATE}}`, `{{NOTE_2_BODY}}` | "Saving is right until it isn't" — `notes/saving-is-right-until-it-isnt/` |
| `{{NOTE_3_DATE}}`, `{{NOTE_3_BODY}}` | "The Rule of Five, worked" — `notes/the-rule-of-five-worked/` |

The body placeholder sits in one `<p>`. Replace it with as many paragraphs
as you like inside the same `<div class="wrap">`.

## Legal pages

| Placeholder | Where |
|---|---|
| `{{PRIVACY_UPDATED_DATE}}` | `privacy/index.html` |
| `{{TERMS_UPDATED_DATE}}` | `terms/index.html` |

Both pages are written from what the site actually does. Read them once
before the site goes live; they are plain, but they are still yours.

## Judgment calls to confirm or change

1. **The Dashboard moved.** The domain root has to be the home page, so
   the Dashboard is now `dashboard.html` (still at the repo root). Old
   share links and dashboard hashes are forwarded from the home page.
   DECISIONS.md D-092. If you'd rather the tools kept the root and the
   site lived elsewhere, that is a different domain setup — say so.
2. **Money Mirror.** There is no Money Mirror room in this repo. The only
   financial-personality quiz is Dungeons & Dividends (`dnd/index.html`),
   so the teaser on the home page uses three of its questions verbatim
   and links there. The three one-line results are mine. If the Money
   Mirror is a room you still mean to build, the teaser is one form on
   `index.html` (search for `data-mirror`) and its link is one `href`.
3. **"Start here" ribbons** on `/tools` are on Start Here, Financial
   Snapshot and Cash Flow. Change the list in `tools/index.html`
   (`data-start-here="…"`, registry ids).
4. **Rooms grouped by kind**, not by tier: the four groups the map already
   uses (core / read / about-you / explore), with the map's headings.
5. **The Can I? widget's wording and thresholds** are mine: a monthly cost
   at up to 25% of what's left after fixed bills is a plain yes, up to 60%
   "probably", up to 100% "fits on paper", over that "not on this month's
   numbers"; a one-time cost at up to one month of what's left is a yes,
   up to four months "yes, with a plan", beyond that "a saving-up job".
   DECISIONS.md D-093. The sentences are in `site.js`.
6. **The Can I? widget reads "fixed bills" as the monthly spending figure**
   already in the Money Rooms when it proposes a prefill, because that is
   the closest number the household model holds. It never writes back.
7. **Copy I added** that wasn't in your brief, all short and all
   removable: the "None of them?" section on `/start-here`; the five
   bullets in the "what to expect" panel on `/coaching`; the "Questions
   people ask first" heading over the FAQ; the group headings and blurbs
   on `/tools`; the closing line about the two orders on `/frameworks`;
   the hero lines on `/media`, `/notes`, `/privacy`, `/terms` and `/404`;
   the "Free · 60 min" and "Not ready? Start with a tool" buttons; the
   card blurbs under "Three ways in" on the home page; the meta
   descriptions.
8. **Light mode and calm mode apply to the site only.** The rooms stay
   navy. A visitor in light mode who opens a tool sees the tools' own
   dark design.
9. **The old `tools.stresslessaboutmoney.com` mirror** cannot stay a second
   custom domain on the same GitHub Pages site once `CNAME` says
   `stresslessaboutmoney.com`. See the DNS notes in the handover message.

## Before going live

- [ ] Fill every placeholder above, then run `node test/site.js` — it
      checks the sitemap, canonical URLs, landmarks, links and this file.
- [ ] Add `site/og.png` (1200×630) and the headshot.
- [ ] Set the DNS records and turn on "Enforce HTTPS" in the repo's Pages
      settings once the certificate is issued.
- [ ] Decide whether to turn on Plausible: uncomment one line in the
      `<head>` of each page (search for `plausible.io`).
- [ ] Add real, consented testimonials to `site/testimonials.json`.
