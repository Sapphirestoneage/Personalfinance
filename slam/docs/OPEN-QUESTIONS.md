# Open questions for the owner (phases 0 and 1)

The spec said to list every ambiguity that affects phase 0 or 1 and ask
before guessing on privacy, safety, or money math. The same message said
not to stop for questions. So each item below names the ambiguity, the
working assumption phase 0 was built on, and where to change it. Nothing
here is decided; an answer changes one place in the code and one line here.

## Money math

1. **Dream and Disaster conversion multipliers vs G20.** G20 pins Dream at
   78 inquiries with $4,964.25 profit and 17.24 sessions. That number only
   holds if the +20% conversion does NOT touch pass, booking or show rates
   (with booking x1.2 the sessions would hit the cap of 18 and profit would
   be $5,250). Working assumption: the conversion multiplier scales only the
   sales conversion step (consult close, follower to subscriber, follower
   to tribute), never screening, booking or show. This also keeps screening
   out of sales. Change in `src/engine/scenarios.ts` (`applyMultipliers`).

2. **G7 offer model.** $1,723.38 and 3.52 sessions reproduce exactly only
   with this model: every new client has one single session; clients who do
   not take the retainer rebook at 30%; retainer clients get 2 sessions x 4
   months and do not rebook as singles; the add-on is bought by 25% of new
   clients, with the 5% fee and no delivery cost. Confirm that this is the
   intended meaning of "add-on $200 at 25%" and "10% take". Change in
   `src/engine/businesses/inPerson.ts`.

3. **Arc offers and rebooking.** G8 ($1,666) holds only when the arc has no
   rebook, add-on or retainer on top. Working assumption: when the main
   offer is a consult offer, the business is arc-only. Same file.

4. **Capacity when the cap binds.** G5 shows sessions capped at 18. When
   the cap binds with add-ons and retainers in play, every volume (clients,
   add-ons, retainer clients) is scaled by cap / demand. Alternative: cap
   only single sessions. Same file, `capFactor`.

5. **Sellable hours.** Shared settings give available hours and recovery
   days. Working assumption: sellable hours per month = available hours per
   week x 52 / 12, where "available hours per week" is already net of
   recovery days; recovery days are validated (never below 1) and used for
   pacing (sessions per working day), not subtracted twice. Change in
   `src/engine/formulas.ts` (`sellableHoursPerMonth`).

6. **Hours allocation across businesses (F23).** Business #1 takes the
   hours it needs, #2 gets the rest, and so on. In-person recomputes with
   the hour cap (F04). For flat-hour businesses (content, calls, findom)
   that get fewer hours than they asked for, GP scales linearly with the
   share of hours received and the result is flagged `hoursLimited`.
   Change in `src/engine/aggregate.ts`.

7. **Runway shortfall.** runway = cash on hand / max(0, income goal -
   monthly profit). If profit covers the goal, runway is "not needed".
   Alternative: shortfall = fixed costs - GP (cash burn only). Change in
   `src/engine/formulas.ts` (`runwayMonths`).

8. **Payback days (F08).** CAC / (GP per client per month / 30). Change in
   `formulas.ts` (`paybackDays`).

9. **Leverage discount (F11).** Score = added annual profit / total cost x
   52 / (52 + weeks to money). 0 weeks = no discount, 52 weeks = half.
   Change in `src/engine/leverage.ts`.

10. **Event parameters.** Each event is a named transform with a default
    size, all in `src/content/presets.ts` and editable per business:
    platform ban = an audience business (content, calls, regulars) loses
    its audience and recurring revenue for the month; in-person loses the
    share of inquiries that came through the platform, 50% by default; house stops = inquiries minus the house's share (100%
    when it is the only source, giving G21); top regular leaves = minus one
    regular at the average monthly (or their agreed budget when a client
    record names them); month off sick = sessions, calls and customs to
    zero, subscriptions and regulars continue; processor hold = one month
    of that business's revenue is held (hits runway, not profit); price war
    = prices -15%; viral post = audience +50%; press feature = inquiries
    +30%; waitlist = demand at capacity; regular upgrades to retainer = one
    regular's monthly replaced by the retainer price.

11. **Calls model.** "calls/month" is read as total paid-or-booked calls
    this month (G15 uses 8 calls x $200 x 90% directly). No-shows reduce
    paid calls unless a deposit is held; rebook rate feeds the reverse
    solve (new callers needed = calls / (1 + rebook)). Change in
    `src/engine/businesses/calls.ts`.

12. **Content churn.** Months retained = 1 / churn (monthly). New
    subscribers = followers x follower-to-subscriber rate; when she types
    a subscriber count it is used as is, otherwise steady state = new / churn.
    Change in `src/engine/businesses/content.ts`.

13. **Findom chargebacks.** Chargeback rate is taken off gross tributes
    before the processor fee. Change in `src/engine/businesses/regulars.ts`.

14. **Tax set-aside.** Shown as a reminder and subtracted only on the
    "yours to keep" line, never inside profit. No tax advice.

## Privacy and safety

15. **Client alias uniqueness.** Aliases are free text; two clients may
    share one. Working assumption: allowed, with a soft warning.

16. **Screening result values.** `pass | fail | pending | withdrawn`. No
    reasons stored. Confirm the set.

17. **Quick-hide screen.** Phase 0 ships a plain neutral screen titled
    "Notes" with a tap-to-return. Confirm the disguise and whether return
    should need a second tap or a long press.

18. **Export file name.** `numbers-backup-YYYY-MM-DD.json`; the snapshot
    for Sapphire will be `numbers-snapshot-YYYY-MM-DD.json`. Confirm.

19. **Database name.** IndexedDB database is called `slam`. The PWA is
    titled "SLAM" with the description "Stress Less About Money". Confirm
    the on-device name is neutral enough.

## Product

20. **Shared "hourly value".** F07 and F11 need her hourly value. Working
    default: income goal / sellable hours, labeled Placeholder until she
    sets it.

21. **Warning above 5 active businesses.** Wording only; not a block.

22. **Mode names.** "Plain", "Domme", "Pro" label sets. Phase 0 stores the
    choice; phase 1 ships the copy.

## Added in phase 1

23. **What "typical" means in the diagnosis.** The quick diagnosis compares
    her rates and prices to the canonical presets (booking 40%, show 85%,
    rebook 30%, $500 single, and so on) and calls the step with the biggest
    gain the bottleneck. Cohort numbers from Sapphire would be better
    benchmarks; drop them into `benchmarksFor` in `src/content/samples.ts`
    with the label Cohort.

24. **Bookings in the diagnosis.** She types contacts and bookings; the
    booking rate is derived as bookings / (contacts x pass rate), with the
    pass rate left at its preset until she changes it in the tab.

25. **Guided mode writes live.** In the pathway, each answer is saved to
    her business as she goes (label Yours). Only the Toolbox uses the
    sandbox. Say if the pathway should also hold answers until the end.

26. **Presenter view** is bigger text only. Say what else it should hide
    or show.

27. **The snapshot** carries settings, businesses, offers, week logs and
    milestones, plus this month's computed numbers for reading; never
    clients or sales. Confirm.

## Added in the polish passes

28. **Value equation scoring.** Four 1-to-5 ratings; the index maps the
    log of (outcome x likelihood) / (delay x effort) to 0..100 so every
    step counts the same. The weakest lever's advice never touches
    screening. Change in `src/engine/formulas.ts` (`valueEquation`).

29. **Stack-to-price target 3x and worth-to-cost 3 : 1.** Both presets,
    both from the published frameworks. Change the constants in
    `src/engine/formulas.ts`.

30. **Rates from the client log** use records whose first contact is
    inside the last 90 days and need 10 contacts before the one-tap
    replace. Change `LOG_MIN_CONTACTS` and the window in
    `src/engine/reality.ts`.

31. **Content levers on next month.** This month's gross profit uses the
    subscriber count she typed; churn and follower-to-subscriber rate are
    measured on next month's number so they show a real value. Say if the
    tab should show next month's number too.

32. **Milestones** are eight fixed keys, computed from what she has done;
    stored rows only add to them. Wording in `src/engine/reality.ts`.

33. **Event sizes** live on the scenario rows (Disaster's sizes for
    disaster events, Dream's for dream events), not per business.

34. **Older rows and files.** A week log saved before the check-in flag
    existed counts as a check-in when it holds any number. Say if those
    should count as zero instead.

35. **The readable snapshot** lists every input of every active business
    with its label. Say if Sapphire would rather have fewer lines.

36. **The error screen** shows the technical message under the plain
    one, so a screenshot to Sapphire says what broke. Say if it should
    hide it.

37. **Levels.** Five planets by five bands mirror the SPARKS Sky. Decided
    by the owner: a confirmed estimate counts the same as a typed number.
    Open: whether Today should keep offering the next short level ahead of
    the next tool.
