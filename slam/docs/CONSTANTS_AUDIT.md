# Constants audit (checker, 2026-10-23)

Every financial constant the SLAM app carries, where it lives, its value, the
official source it should match, and whether it does. The web was not reachable
from the checking environment (DNS failed for irs.gov, ssa.gov and tax.ny.gov),
so every "match" below is a match against the checker's own knowledge of the
2026 figures, not against a page fetched today. Treat the whole table as
**unverified by fetch**; the "Status" column says how sure the checker is.

Status words: **match** (the value agrees with the 2026 figure as the checker
knows it; still confirm by opening the link), **differs** (the checker believes
the value is wrong; the note says what it expected), **unverifiable** (not
published yet, or nothing official to compare with), **assumption** (a house
figure, no official source exists; the note gives a reference point where one
helps), **design** (an app setting, not a financial fact).

## 1. `data/rules-2026.json` (the registry the engines read)

Every rule, in file order. The file's own `verified` word is shown beside the
checker's status.

| Rule id | What | Value in the file | File says | Checker status | Should match (source) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `K401_DEF` | 401(k)/403(b)/457(b)/TSP employee deferral | 24,500 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `K401_CU50` | Catch-up, age 50+ | 8,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `K401_CU6063` | Super catch-up, ages 60-63 | 11,250 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ROTH_CU_WAGE` | Roth catch-up wage threshold | 150,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ADD_415C` | Total annual additions (employee + employer + after-tax) | 72,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `COMP_401A17` | Compensation limit for contributions | 360,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `HCE` | Highly compensated employee threshold | 160,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SIMPLE_DEF` | SIMPLE IRA / SIMPLE 401(k) deferral | 17,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SIMPLE_CU50` | SIMPLE catch-up, age 50+ | 4,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SIMPLE_CU6063` | SIMPLE super catch-up, ages 60-63 | 5,250 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SEP_MAX` | SEP IRA maximum | 72,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `LOAN_401K` | 401(k) loan maximum | 50,000 | law | **match** | IRC section 72(p)(2)(A), https://www.law.cornell.edu/uscode/text/26/72 | The lesser of 50,000 or half the vested balance; statute, not indexed. |
| `IRA_LIMIT` | IRA contribution limit (traditional + Roth combined) | 7,500 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `IRA_CU50` | IRA catch-up, age 50+ | 1,100 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ROTH_PO_S_LO` | Roth IRA phase-out start, single/HOH | 153,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ROTH_PO_S_HI` | Roth IRA phase-out end, single/HOH | 168,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ROTH_PO_J_LO` | Roth IRA phase-out start, married filing jointly | 242,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ROTH_PO_J_HI` | Roth IRA phase-out end, married filing jointly | 252,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `ROTH_PO_MFS` | Roth IRA phase-out, married filing separately | 10,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `TIRA_DED_S_LO` | Traditional IRA deduction phase-out start, single covered by workplace plan | 81,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `TIRA_DED_S_HI` | Traditional IRA deduction phase-out end, single covered | 91,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `TIRA_DED_J_LO` | Deduction phase-out start, MFJ, contributing spouse covered | 129,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `TIRA_DED_J_HI` | Deduction phase-out end, MFJ, contributing spouse covered | 149,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `TIRA_DED_SP_LO` | Deduction phase-out start, not covered but spouse is | 242,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `TIRA_DED_SP_HI` | Deduction phase-out end, not covered but spouse is | 252,000 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SAVER_S` | Saver's Credit income limit, single/MFS | 40,250 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SAVER_H` | Saver's Credit income limit, head of household | 60,375 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SAVER_J` | Saver's Credit income limit, MFJ | 80,500 | yes | **match** | IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `RMD_AGE` | Required minimum distribution start age | 73 | law | **match** | IRC section 401(a)(9)(C), https://www.law.cornell.edu/uscode/text/26/401 (SECURE 2.0 section 107) | 73 for people born 1951 to 1959; 75 for those born 1960 or later. |
| `EARLY_AGE` | Penalty-free withdrawal age | 59.5 | law | **match** | IRC section 72(t)(2)(A)(i), https://www.law.cornell.edu/uscode/text/26/72 |  |
| `RULE_55` | Rule of 55 separation age | 55 | law | **match** | IRC section 72(t)(2)(A)(v), https://www.law.cornell.edu/uscode/text/26/72 |  |
| `ROTH_5YR` | Roth five-year rule | 5 | law | **match** | IRC section 408A(d)(3)(F), https://www.law.cornell.edu/uscode/text/26/408A (conversions) and 408A(d)(2)(B) (the account clock) |  |
| `INHERIT_10YR` | Inherited IRA 10-year rule | 10 | law | **match** | IRC section 401(a)(9)(H), https://www.law.cornell.edu/uscode/text/26/401 |  |
| `HSA_SELF` | HSA limit, self-only coverage | 4,400 | yes | **match** | IRS Rev. Proc. 2025-19, https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |  |
| `HSA_FAM` | HSA limit, family coverage | 8,750 | yes | **match** | IRS Rev. Proc. 2025-19, https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |  |
| `HSA_CU55` | HSA catch-up, age 55+ | 1,000 | yes | **match** | IRC section 223(b)(3), https://www.law.cornell.edu/uscode/text/26/223 | Fixed by statute, not indexed. |
| `HDHP_MIN_S` | HDHP minimum deductible, self | 1,700 | yes | **match** | IRS Rev. Proc. 2025-19, https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |  |
| `HDHP_MIN_F` | HDHP minimum deductible, family | 3,400 | yes | **match** | IRS Rev. Proc. 2025-19, https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |  |
| `HDHP_OOP_S` | HDHP out-of-pocket max, self | 8,500 | yes | **match** | IRS Rev. Proc. 2025-19, https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |  |
| `HDHP_OOP_F` | HDHP out-of-pocket max, family | 17,000 | yes | **match** | IRS Rev. Proc. 2025-19, https://www.irs.gov/pub/irs-drop/rp-25-19.pdf |  |
| `HSA_PEN` | HSA non-medical withdrawal penalty before 65 | 0.2 (20%) | law | **match** | IRC section 223(f)(4), https://www.law.cornell.edu/uscode/text/26/223 |  |
| `FSA_LIMIT` | Health FSA limit | 3,400 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `FSA_CARRY` | Health FSA carryover (if plan allows) | 680 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) | 20% of the FSA limit. |
| `DCFSA` | Dependent care FSA limit per household | 7,500 | yes | **match** | One Big Beautiful Bill Act (Pub. L. 119-21) section 70404, amending IRC section 129(a)(2), https://www.law.cornell.edu/uscode/text/26/129 | Raised from 5,000 for years after 2025; 3,750 if married filing separately. |
| `GIFT_EXCL` | Gift tax annual exclusion (per recipient) | 19,000 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) | Unchanged from 2025. |
| `ABLE_LIMIT` | ABLE annual contribution limit | 19,000 | verify | **match** | IRC section 529A(b)(2)(B), https://www.law.cornell.edu/uscode/text/26/529A; equals the gift exclusion | ABLE to Work adds the lesser of the poverty line or the beneficiary's pay on top. |
| `K12_529` | 529 K-12 tuition withdrawal limit | 20,000 | yes | **match** | One Big Beautiful Bill Act section 70413, amending IRC section 529(c)(7), https://www.law.cornell.edu/uscode/text/26/529 | Per beneficiary per year, from 2026 (was 10,000). |
| `R529_ROTH` | 529-to-Roth lifetime rollover cap | 35,000 | law | **match** | IRC section 529(c)(3)(E), https://www.law.cornell.edu/uscode/text/26/529 | Lifetime, per beneficiary; the account must be 15 years old. |
| `COVERDELL` | Coverdell ESA annual limit per beneficiary | 2,000 | law | **match** | IRC section 530(b)(1)(A)(iii), https://www.law.cornell.edu/uscode/text/26/530 |  |
| `TRUMP_LIMIT` | Trump account annual contribution limit | 5,000 | yes | **match** | IRS Notice 2025-68, https://www.irs.gov/pub/irs-drop/n-25-68.pdf | Indexed after 2027. |
| `TRUMP_EMPLOYER` | Trump account employer contribution (per employee) | 2,500 | yes | **match** | IRS Notice 2025-68, https://www.irs.gov/pub/irs-drop/n-25-68.pdf |  |
| `TRUMP_PILOT` | Trump account federal pilot deposit | 1,000 | yes | **match** | IRS Notice 2025-68, https://www.irs.gov/pub/irs-drop/n-25-68.pdf | The pilot deposit for children born 2025 through 2028. |
| `STD_S` | Standard deduction, single | 16,100 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `STD_J` | Standard deduction, married filing jointly | 32,200 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG0_S` | 0% long-term capital gains bracket top, single | 49,450 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG0_J` | 0% long-term capital gains bracket top, MFJ | 98,900 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG0_H` | 0% long-term capital gains bracket top, head of household | 66,200 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG15_S` | 15% bracket top, single | 545,500 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG15_J` | 15% bracket top, MFJ | 613,700 | yes | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `SS_WAGE` | Social Security wage base | 184,500 | yes | **match** | SSA contribution and benefit base, https://www.ssa.gov/oact/cola/cbb.html; 2026 COLA fact sheet, https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf; also IRS Notice 2025-67, https://www.irs.gov/pub/irs-drop/n-25-67.pdf (and the IRS news release "401(k) limit increases to $24,500 for 2026", https://www.irs.gov/newsroom) |  |
| `SE_FACTOR` | Net earnings factor for SE tax | 0.9235 (92.35%) | law | **match** | IRC section 1402(a)(12), https://www.law.cornell.edu/uscode/text/26/1402 |  |
| `IRMAA1` | Medicare IRMAA first threshold, single MAGI | 109,000 | yes | **match** | CMS, 2026 Medicare Parts A and B premiums and deductibles, https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles | The first Part B IRMAA tier for 2026 (single, based on 2024 MAGI); joint is 218,000. CMS, not the IRS, sets it. |
| `SS_EARN_TEST` | Social Security earnings test (under full retirement age) | 24,480 | yes | **match** | SSA contribution and benefit base, https://www.ssa.gov/oact/cola/cbb.html; 2026 COLA fact sheet, https://www.ssa.gov/news/press/factsheets/colafacts2026.pdf | Under full retirement age; the year-of-FRA figure is 65,160. |
| `STUDENT_INT` | Student loan interest deduction maximum | 2,500 | verify | **match** | IRC section 221(b)(1), https://www.law.cornell.edu/uscode/text/26/221 | Not indexed; phases out with income (2026: 85,000 to 100,000 single). |
| `MORT_CAP` | Mortgage interest deduction debt cap | 750,000 | verify | **match** | IRC section 163(h)(3)(F), https://www.law.cornell.edu/uscode/text/26/163 | Made permanent by the One Big Beautiful Bill Act section 70108. |
| `ESPP_CAP` | ESPP purchase limit | 25,000 | law | **match** | IRC section 423(b)(8), https://www.law.cornell.edu/uscode/text/26/423 |  |
| `ISO_CAP` | ISO first-exercisable limit | 100,000 | law | **match** | IRC section 422(d), https://www.law.cornell.edu/uscode/text/26/422 |  |
| `SEC121` | Home sale gain exclusion | 250,000 | law | **match** | IRC section 121(b), https://www.law.cornell.edu/uscode/text/26/121 |  |
| `FED_BRK_S` | Federal income tax brackets, single | `[[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [null, 0.37]]` | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `FED_BRK_J` | Federal income tax brackets, married filing jointly | `[[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [null, 0.37]]` | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `FED_BRK_MFS` | Federal income tax brackets, married filing separately | `[[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [null, 0.37]]` | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `FED_BRK_H` | Federal income tax brackets, head of household | `[[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [null, 0.37]]` | verify | **differs** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) | My recollection of the head of household 24% bracket top is 201,775 (the same as single, as in 2024 and 2025); the file has 201,750. The 32% top of 256,200 (25 under single) matches the pattern of earlier years. At most about 2 dollars of tax either way. Verify both against the table in Rev. Proc. 2025-32. |
| `STD_MFS` | Standard deduction, married filing separately | 16,100 | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `STD_H` | Standard deduction, head of household | 24,150 | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG0_MFS` | 0% long-term capital gains bracket top, MFS | 49,450 | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG15_MFS` | 15% bracket top, MFS | 306,850 | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `LTCG15_H` | 15% bracket top, head of household | 579,600 | verify | **match** | IRS Rev. Proc. 2025-32, https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (news release https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill) |  |
| `FICA_SS_RATE` | Social Security tax rate, employee share | 0.062 (6.2%) | law | **match** | IRC section 3101(a), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `FICA_MED_RATE` | Medicare tax rate, employee share | 0.0145 (1.45%) | law | **match** | IRC section 3101(b)(1), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `SE_SS_RATE` | Self-employment Social Security rate | 0.124 (12.4%) | law | **match** | IRC section 1401(a), https://www.law.cornell.edu/uscode/text/26/1401 |  |
| `SE_MED_RATE` | Self-employment Medicare rate | 0.029 (2.9%) | law | **match** | IRC section 1401(b)(1), https://www.law.cornell.edu/uscode/text/26/1401 |  |
| `SE_DEDUCT_SHARE` | Share of SE tax deductible above the line | 0.5 (50%) | law | **match** | IRC section 164(f), https://www.law.cornell.edu/uscode/text/26/164 |  |
| `ADD_MED_RATE` | Additional Medicare tax rate | 0.009 (0.9%) | law | **match** | IRC section 3101(b)(2), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `ADD_MED_S` | Additional Medicare threshold, single / HOH | 200,000 | law | **match** | IRC section 3101(b)(2), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `ADD_MED_J` | Additional Medicare threshold, MFJ | 250,000 | law | **match** | IRC section 3101(b)(2), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `NY_BRK_S` | New York State income tax brackets, single | `[[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]]` | verify | **unverifiable** | NY Tax Law section 601 as amended by the FY2026 budget (Chapter 59 of the Laws of 2025, Part A), https://www.nysenate.gov/legislation/laws/TAX/601; 2026 withholding tables NYS-50-T-NYS, https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf | Thresholds are the long-standing ones in section 601 and match. The five lowest rates for 2026 (3.9, 4.4, 5.15, 5.4, 5.9) are what the FY2026 budget set for tax year 2026 as I recall it, with a further 0.1 point cut for 2027 and after; the 2026 IT-201 instructions are not out until early 2027. The rates above 5.9% are unchanged through 2032. New York City tax (about 3.078 to 3.876%) is not modeled at all. |
| `NY_BRK_J` | New York State income tax brackets, married filing jointly | `[[17150, 0.039], [23600, 0.044], [27900, 0.0515], [161550, 0.054], [323200, 0.059], [2155350, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]]` | verify | **unverifiable** | NY Tax Law section 601 as amended by the FY2026 budget (Chapter 59 of the Laws of 2025, Part A), https://www.nysenate.gov/legislation/laws/TAX/601; 2026 withholding tables NYS-50-T-NYS, https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf | Thresholds are the long-standing ones in section 601 and match. The five lowest rates for 2026 (3.9, 4.4, 5.15, 5.4, 5.9) are what the FY2026 budget set for tax year 2026 as I recall it, with a further 0.1 point cut for 2027 and after; the 2026 IT-201 instructions are not out until early 2027. The rates above 5.9% are unchanged through 2032. New York City tax (about 3.078 to 3.876%) is not modeled at all. |
| `NY_BRK_H` | New York State income tax brackets, head of household | `[[12800, 0.039], [17650, 0.044], [20900, 0.0515], [107650, 0.054], [269300, 0.059], [1616450, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]]` | verify | **unverifiable** | NY Tax Law section 601 as amended by the FY2026 budget (Chapter 59 of the Laws of 2025, Part A), https://www.nysenate.gov/legislation/laws/TAX/601; 2026 withholding tables NYS-50-T-NYS, https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf | Thresholds are the long-standing ones in section 601 and match. The five lowest rates for 2026 (3.9, 4.4, 5.15, 5.4, 5.9) are what the FY2026 budget set for tax year 2026 as I recall it, with a further 0.1 point cut for 2027 and after; the 2026 IT-201 instructions are not out until early 2027. The rates above 5.9% are unchanged through 2032. New York City tax (about 3.078 to 3.876%) is not modeled at all. |
| `NY_STD_S` | New York standard deduction, single (not a dependent) | 8,000 | law | **match** | NY Tax Law section 614, https://www.nysenate.gov/legislation/laws/TAX/614 |  |
| `NY_STD_J` | New York standard deduction, MFJ | 16,050 | law | **match** | NY Tax Law section 614, https://www.nysenate.gov/legislation/laws/TAX/614 |  |
| `NY_STD_H` | New York standard deduction, head of household | 11,200 | law | **match** | NY Tax Law section 614, https://www.nysenate.gov/legislation/laws/TAX/614 |  |
| `EST_Q1` | Estimated tax due date, first quarter | 04-15 | law | **match** | IRS Form 1040-ES (2026), https://www.irs.gov/pub/irs-pdf/f1040es.pdf |  |
| `EST_Q2` | Estimated tax due date, second quarter | 06-15 | law | **match** | IRS Form 1040-ES (2026), https://www.irs.gov/pub/irs-pdf/f1040es.pdf |  |
| `EST_Q3` | Estimated tax due date, third quarter | 09-15 | law | **match** | IRS Form 1040-ES (2026), https://www.irs.gov/pub/irs-pdf/f1040es.pdf |  |
| `EST_Q4` | Estimated tax due date, fourth quarter | 01-15 | law | **match** | IRS Form 1040-ES (2026), https://www.irs.gov/pub/irs-pdf/f1040es.pdf |  |
| `EARLY_PENALTY` | Early withdrawal penalty on retirement money | 0.1 (10%) | law | **match** | IRC section 72(t)(1), https://www.law.cornell.edu/uscode/text/26/72 |  |
| `ADD_MED_MFS` | Additional Medicare threshold, MFS | 125,000 | law | **match** | IRC section 3101(b)(2), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `ADD_MED_H` | Additional Medicare threshold, head of household | 200,000 | law | **match** | IRC section 3101(b)(2), https://www.law.cornell.edu/uscode/text/26/3101 |  |
| `SE_MIN` | Net SE earnings below which no SE tax is due | 400 | law | **match** | IRC section 1402(b)(2), https://www.law.cornell.edu/uscode/text/26/1402 | The engine tests 92.35% of profit against 400; the statute tests net earnings from self-employment, which is the same figure. |
| `LTCG_RATE_0` | Long-term gains rate in the 0% band | 0 | law | **match** | IRC section 1(h), https://www.law.cornell.edu/uscode/text/26/1 |  |
| `LTCG_RATE_15` | Long-term gains rate in the 15% band | 0.15 (15%) | law | **match** | IRC section 1(h), https://www.law.cornell.edu/uscode/text/26/1 |  |
| `LTCG_RATE_20` | Long-term gains rate above the 15% band | 0.2 (20%) | law | **match** | IRC section 1(h), https://www.law.cornell.edu/uscode/text/26/1 |  |
| `NY_BRK_MFS` | New York State income tax brackets, married filing separately | `[[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]]` | verify | **unverifiable** | NY Tax Law section 601 as amended by the FY2026 budget (Chapter 59 of the Laws of 2025, Part A), https://www.nysenate.gov/legislation/laws/TAX/601; 2026 withholding tables NYS-50-T-NYS, https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf | Thresholds are the long-standing ones in section 601 and match. The five lowest rates for 2026 (3.9, 4.4, 5.15, 5.4, 5.9) are what the FY2026 budget set for tax year 2026 as I recall it, with a further 0.1 point cut for 2027 and after; the 2026 IT-201 instructions are not out until early 2027. The rates above 5.9% are unchanged through 2032. New York City tax (about 3.078 to 3.876%) is not modeled at all. |
| `NY_STD_MFS` | New York standard deduction, MFS | 8,000 | law | **match** | NY Tax Law section 614, https://www.nysenate.gov/legislation/laws/TAX/614 |  |
| `APP_INCOME_END_DAYS` | Look-ahead for an income stream ending | 90 | app | **design** | SLAM design (Phase 1 brief) |  |
| `APP_RULE_OF_5` | Rule of 5: months of expenses = age divided by this | 5 | app | **design** | SLAM design (Phase 1 brief) |  |
| `APP_COAST_AGE` | Default age Coast FI grows to when no goal age is entered | 65 | app | **design** | SLAM design (Phase 1 brief) |  |
| `APP_HEALTH_PARENT_AGE` | Age a parent plan ends | 26 | law | **match** | 42 U.S.C. 300gg-14, https://www.law.cornell.edu/uscode/text/42/300gg-14 |  |
| `APP_CARD_MIN_PCT` | Default card minimum: this share of the balance plus a month of interest | 0.01 (1%) | assumption | **assumption** | House assumption (Eli) | Issuers commonly use 1% of the balance plus interest and fees, or 2%, with a 25 to 40 floor (CFPB, "Credit card minimum payment" explainer, https://www.consumerfinance.gov/ask-cfpb/). The root app's data/debt_rules.json uses 2% or 25: the same assumption, defined twice with different values. |
| `APP_CARD_MIN_FLOOR` | Default card minimum: never less than this | 40 | assumption | **assumption** | House assumption (Eli) | See APP_CARD_MIN_PCT; the root app uses a 25 floor. |
| `APP_GUESS_SWING` | How far a rough number is moved to rank the still-guessing list | 0.2 (20%) | app | **design** | SLAM design (Phase 1 brief) |  |
| `APP_PROJ_MONTHS` | Months the projection runs month by month before going yearly | 24 | app | **design** | SLAM design (Phase 1 brief) |  |
| `DEFAULT_CARD_APR` | Card interest rate used when a card has no APR, or an intro rate has no rate after it | 0.25 (25%) | assumption | **assumption** | House assumption (Eli) | Federal Reserve G.19: the average rate on card accounts assessed interest was about 22 to 23% in 2025 (https://www.federalreserve.gov/releases/g19/current/). 25% is a cautious house figure. |
| `DEFAULT_DUE_DAY` | Day of the month a debt payment is due when none is entered | 1 | assumption | **assumption** | House assumption (Eli) |  |
| `STAGE_RUNWAY_RED_MONTHS` | Cash runway under this many months is stage 1 (red) | 1 | assumption | **assumption** | House assumption (Eli) |  |
| `STAGE_UTIL_RED` | Card utilization over this is stage 1 (red) | 0.3 (30%) | assumption | **assumption** | House assumption (Eli) | The 30% figure is a widespread rule of thumb (Experian, myFICO guidance); no bureau publishes a threshold. |
| `STAGE_UTIL_GREEN` | Card utilization at or under this is stage 3 (green) | 0.1 (10%) | assumption | **assumption** | House assumption (Eli) |  |
| `STAGE_FI_YELLOW_RATIO` | FI goal under this share of the spending-implied FI number is stage 1 (red) | 0.8 (80%) | assumption | **assumption** | House assumption (Eli) |  |
| `STAGE_FI_GREEN_RATIO` | FI goal at or over this share of the spending-implied FI number is stage 3 (green) | 1 | assumption | **assumption** | House assumption (Eli) |  |
| `STAGE_REPLACE_YELLOW` | A replacement income this likely makes an ending income stage 2 (yellow) | 0.5 (50%) | assumption | **assumption** | House assumption (Eli) |  |
| `STAGE_COVERAGE_RED_DAYS` | A coverage change sooner than this with no plan type is stage 1 (red) | 90 | assumption | **assumption** | House assumption (Eli) |  |
| `TAX_RETURN_DUE` | Federal income tax return and balance due date | 04-15 | law | **match** | IRS Form 1040 instructions, https://www.irs.gov/pub/irs-pdf/i1040gi.pdf |  |
| `STAGE_CLIFF_MONTHS` | Look-ahead for certain income dropping to $0 | 6 | assumption | **assumption** | House assumption (Eli) |  |
| `SCENARIO_LIKELY_RETURN` | Real return in the likely assumption set | 0.06 (6%) | assumption | **assumption** | House assumption (Eli) | The root app's data/defaults.json declares the likely real return as 5%, not 6%: the same assumption, defined twice with different values. |
| `SCENARIO_LIKELY_WR` | Withdrawal rate in the likely assumption set | 0.04 (4%) | assumption | **assumption** | House assumption (Eli) | Bengen (1994) and the Trinity study; the root app's shared/schema.js swrRate is also 0.04. |
| `SCENARIO_WORST_RETURN` | Real return in the worst assumption set | 0.04 (4%) | assumption | **assumption** | House assumption (Eli) |  |
| `SCENARIO_WORST_WR` | Withdrawal rate in the worst assumption set | 0.035 (3.5%) | assumption | **assumption** | House assumption (Eli) | Early Retirement Now's safe withdrawal rate series suggests 3.25 to 3.5% for horizons over 30 years. |
| `DEFAULT_APY` | APY used when a cash account (not high-yield savings) has none | 0.0001 (0.01%) | assumption | **assumption** | House assumption (Eli) |  |
| `DEFAULT_PHONE_PLAN_1` | Monthly cost of a standard phone plan for one line, used when a phone expense has no amount | 70 | assumption | **assumption** | House assumption (Eli) | A single unlimited line at the three national carriers lists at about 65 to 90 a month before discounts (2026 plan pages); 70 is reasonable. |
| `SUB_REVIEW_DAYS` | Days after which a subscription is due another look | 90 | assumption | **assumption** | House assumption (Eli) |  |
| `SUB_RENEW_SOON_DAYS` | Days before a subscription charges that it is flagged | 14 | assumption | **assumption** | House assumption (Eli) |  |
| `DEFAULT_VEHICLE_DEPRECIATION` | Yearly change in a vehicle's value when none is entered | -0.15 (-15%) | assumption | **assumption** | House assumption (Eli) | Also set as 0.15 in slam/src/calc/owning.js (same value, defined twice). |

Counts: assumption 21, design 5, differs 1, match 101, unverifiable 4 (of 132 rules).

## 2. Other data files under `slam/data/`

| File | Constant | Value | Should match (source) | Checker status | Note |
| --- | --- | --- | --- | --- | --- |
| `tax-constants.json` | standard deductions (4 statuses) | 16,100 / 32,200 / 16,100 / 24,150 | Rev. Proc. 2025-32 | match | Also in the registry (`STD_*`): **the same assumption defined twice**, same values today. Read by the Budget's `src/calc/tax.js` and `income.js`; the Ledger and Dashboard read the registry. |
| `tax-constants.json` | federal brackets (4 statuses) | as `FED_BRK_*` | Rev. Proc. 2025-32 | match (same caveat on head of household) | Defined twice; identical today. |
| `tax-constants.json` | FICA 6.2% / 1.45%, wage base 184,500 | | IRC 3101; SSA | match | Defined twice. |
| `tax-constants.json` | self-employment 92.35% / 12.4% / 2.9% | | IRC 1401, 1402 | match | Defined twice. The Budget's `src/calc/tax.js` caps the 12.4% at the wage base on self-employment earnings alone; the Ledger's `engine/tax.js` caps it at the wage base **less W-2 wages** (the correct reading). Two formulas for one tax. |
| `tax-constants.json` | `notIncluded` says the 0.9% additional Medicare tax is not included | | | note | True for the Budget; the registry has `ADD_MED_*` and the Ledger engine applies it. The note is now wrong for half the app. |
| `benchmarks.json` | 50 / 30 / 20 needs, wants, savings | 0.5 / 0.3 / 0.2 | Warren and Tyagi, All Your Worth (2005) | match (a convention) | |
| `benchmarks.json` | housing share reference line | 0.35 | Convention (the 30% rule is more common; HUD's "cost burdened" line is 30% of income) | assumption | 35% is defensible for high-cost areas; say which. Also passed as a default argument in `src/calc/totals.js` (`housingBand = 0.35`): **defined twice**, same value. |
| `spending-averages.json` | national average spending by household size | e.g. 1 person: housing 1,500, food 550, transport 650 | BLS Consumer Expenditure Survey tables, https://www.bls.gov/cex/tables.htm | unverifiable | The file calls itself a PLACEHOLDER typed from memory, year 2023. Not checked here; the app labels them Guess. |
| `era-templates.json` | income and spending shares per era (0.55 to 1.1) | | none (design) | design | |
| `merchant-rules.json`, `subcategory-ideas.json`, `institutions.json` | keyword and name lists | | none | design | No financial constants. |

## 3. Numbers written into code

Engines are clean: every tax, limit and threshold in `engine/*.js` comes from the registry (`rules.get`). The Budget's math library (`src/calc/`) has a few:

| Where | Value | What it is | Source it should match | Status |
| --- | --- | --- | --- | --- |
| `src/calc/owning.js:34` | 0.01 a year | home maintenance guess | The "1% rule" is a convention (Freddie Mac and others cite 1 to 4%) | assumption; labeled Guess |
| `src/calc/owning.js:35` | 0.15 a year | vehicle depreciation guess | Convention; same as `DEFAULT_VEHICLE_DEPRECIATION` (-0.15) | assumption; **defined twice**, same value |
| `src/calc/totals.js:53` | 0.35 | housing band default argument | `benchmarks.json` housingBand | defined twice, same value |
| `src/calc/compare.js:101` | 0.15 | proof-of-cash tolerance | design | design |
| `src/calc/history.js:29` | 0.05 | up/down trend threshold | design | design |
| `src/calc/log.js:44` | 2% or 1 dollar | CSV match tolerance | design | design |
| `src/calc/loop.js:175` | 10 dollars and 5% | "big" variance | design | design |
| `src/calc/networth.js:117` | 10,000 / 25,000 / 50,000 / 100,000 | FI net worth milestones | design | design |
| `src/calc/owning.js:62` | 30.4375 | days in an average month | 365.25 / 12 | match |
| `engine/ledger.js:166-176` | scales 1000, 100, 0.5, 0.01, 10000, 1, 500, 0.05 | how a dollar of each headline number is weighed in the still-guessing ranking | design | design |
| `engine/edits.js:166` | 200 | undo steps kept | design | design |

## 4. The same assumption defined twice

Inside SLAM:

1. Federal brackets, standard deductions, FICA and self-employment rates: `data/tax-constants.json` (Budget) and `data/rules-2026.json` (Ledger and Dashboard). Same values today; nothing checks that they stay the same. The registry's own test (`test/rules.test.js`) does not read `tax-constants.json`.
2. Self-employment tax formula: `src/calc/tax.js` and `engine/tax.js` cap the 12.4% part differently (see section 2).
3. Vehicle depreciation 15%: `src/calc/owning.js` and `DEFAULT_VEHICLE_DEPRECIATION`.
4. Housing band 35%: `data/benchmarks.json` and the default argument in `src/calc/totals.js`.
5. Coast age 65: `APP_COAST_AGE`, and the Dashboard's `assumptions.coastAge` default; the demo file carries 65 as a Fact too. Same value.

Across the repository (the SPARKS rooms at the root keep their own tables; SLAM does not read them, but a reader comparing screens will see different numbers):

| Assumption | SLAM | Root app | Same? |
| --- | --- | --- | --- |
| 415(c) annual additions limit | `ADD_415C` 72,000 | `data/irs_limits_2026.json` annualAdditions 70,000 | **No.** 72,000 is the 2026 figure (Notice 2025-67); 70,000 was 2025. The root file says it is unverified. |
| Default card minimum | 1% of the balance plus a month's interest, floor 40 | `data/debt_rules.json` 2% of the balance, floor 25 | **No.** Both are conventions; a card entered in both apps gets different minimums. |
| Likely real return | `SCENARIO_LIKELY_RETURN` 6% | `data/defaults.json` realReturn 5% (and `data/opening.json` likely) | **No.** The SLAM demo household also carries 5% as its own "best" assumption. |
| Withdrawal rate | `SCENARIO_LIKELY_WR` 4% | `shared/schema.js` swrRate 0.04; `data/defaults.json` 0.04 | Yes |
| Worst-case withdrawal rate | `SCENARIO_WORST_WR` 3.5% | `data/opening.json` plans on 3.5% for long horizons | Yes |
| Coast FI age | `APP_COAST_AGE` 65 | `data/fire_variants.json` coastTargetAge 65 | Yes |
| Federal brackets and standard deductions 2026 | `FED_BRK_*`, `STD_*` | `data/federal_brackets_2026.json` | Yes (both carry the head of household 24% top as 201,750) |
| Early withdrawal penalty, age 59.5, Roth 5 years, rule of 55 | `EARLY_PENALTY`, `EARLY_AGE`, `ROTH_5YR`, `RULE_55` | `data/early_access_rules_2026.json` | Yes |
| Lean FI definition | FAT expenses tagged as needs, divided by the withdrawal rate | `data/fire_variants.json`: the F + A + T total (every FAT line) at factor 1, else 70% of spending | **No.** The root app's Lean counts every FAT line; SLAM leaves out FAT wants. The owner's own definition for this check (food, accommodation, transportation costs) matches the root app. |
| Vehicle depreciation | -15% a year | `data/car_costs.json` (not compared) | not checked |

## 5. Not verifiable from this environment

- Every "match" above is from memory of the 2025 releases, not from a fetch. The links are the pages to open.
- The New York 2026 rates (`NY_BRK_*`): the budget bill text is the only source until the 2026 forms are published; the rates above 5.9% are unchanged.
- The federal head of household 24% top (201,750 vs 201,775): open Rev. Proc. 2025-32 section 3.01, Table 4.
- `spending-averages.json`: a placeholder by its own description.
- The root app's `data/aca_2026.json` (FPL 15,650, 400% cliff) and `data/effective_tax_rates_2026.json` were not re-derived; both call themselves unverified. SLAM does not read them.

## 6. Summary

- 132 rules in the registry: 101 match the 2026 figures as the checker knows them, 1 probably differs by 25 dollars (head of household 24% top), 4 New York bracket rules cannot be verified until the 2026 forms exist, 21 are house assumptions and 5 are app settings.
- Nothing in `engine/` inlines a tax number. The Budget side (`src/calc/`) carries a parallel copy of the federal table and a slightly different self-employment formula.
- Three cross-app conflicts worth settling: the 415(c) limit (72,000 vs 70,000), the default card minimum (1% + interest, floor 40 vs 2%, floor 25), and the likely real return (6% vs 5%). One definition conflict: Lean FI.
- Two notes in the data are stale: `tax-constants.json` says the additional Medicare tax is not included (the Ledger includes it), and `rules-2026.json` marks the federal brackets `verify` while the identical `tax-constants.json` copy says they were checked on 2026-10-15.
