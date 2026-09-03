/* GENERATED FILE — do not edit.
 * Source: foo-ladder.jsx. Regenerate with:
 *   npx @babel/cli --presets @babel/preset-react foo-ladder.jsx -o foo-ladder.js
 * The JSX is kept alongside so this file is never the only copy.
 */
const {
  useState,
  useMemo,
  useEffect
} = React;
const {
  Money,
  Schema,
  Spine,
  Reference,
  DemoPersona,
  Ownership
} = SLAF;
const ROOM_ID = 'foo-ladder';

/* Assumption-class defaults (SPEC.md §3). These are not facts about the
   visitor, so unlike every raw input they legitimately carry a default —
   each one is visible and editable below. */
const ASSUMPTIONS = {
  efMonths: 3,
  growthRate: 7
};

/* Fallback IRS limits, replaced by data/irs_limits_2026.json once it loads.
   Kept only so the app renders before the fetch resolves. */
const FALLBACK_LIMITS = {
  k401: 24500,
  k401Catchup: 8000,
  ira: 7500,
  iraCatchup: 1100,
  hsaSelf: 4400,
  hsaFamily: 8750
};
const START = {
  m: 6,
  y: 2026
};
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = n => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const entered = v => Money.isEntered(v);
const monthLabel = m => {
  if (m === null) return "Blocked";
  if (m <= 0) return "Now";
  const total = START.m + m;
  const y = START.y + Math.floor(total / 12);
  return `${MONTH_NAMES[total % 12]} '${String(y).slice(2)} · ${m} mo`;
};

/* ---------- 9-facet sapphire, one facet per FOO step -------------------- */
function GemCrown({
  litCount
}) {
  const cx = 60,
    cy = 60,
    rOuter = 54,
    rInner = 21;
  const facets = [];
  for (let i = 0; i < 9; i++) {
    const a1 = (i * 40 - 90) * Math.PI / 180;
    const a2 = ((i + 1) * 40 - 90) * Math.PI / 180;
    facets.push({
      i,
      d: `M${cx + rOuter * Math.cos(a1)},${cy + rOuter * Math.sin(a1)} L${cx + rOuter * Math.cos(a2)},${cy + rOuter * Math.sin(a2)} L${cx + rInner * Math.cos(a2)},${cy + rInner * Math.sin(a2)} L${cx + rInner * Math.cos(a1)},${cy + rInner * Math.sin(a1)} Z`
    });
  }
  const lit = litCount === null ? 0 : litCount;
  const label = litCount === null ? "—" : `${lit}/9`;
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 120 120",
    style: {
      width: 96,
      height: 96
    },
    "aria-label": litCount === null ? "Not enough entered to score the ladder" : `${lit} of 9 steps complete`
  }, facets.map(f => /*#__PURE__*/React.createElement("path", {
    key: f.i,
    d: f.d,
    fill: f.i < lit ? "var(--sapphire-500)" : "var(--navy-700)",
    stroke: "var(--navy-850)",
    strokeWidth: "1.5",
    style: {
      transition: "fill 500ms ease"
    },
    opacity: f.i < lit ? 1 : 0.55
  })), /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: rInner,
    fill: lit === 9 ? "var(--sapphire-200)" : "var(--navy-750)",
    stroke: "var(--navy-850)",
    strokeWidth: "1.5",
    style: {
      transition: "fill 500ms ease"
    }
  }), /*#__PURE__*/React.createElement("text", {
    x: cx,
    y: cy + 5,
    textAnchor: "middle",
    fontSize: "15",
    fontWeight: "600",
    fontFamily: "var(--font-body)",
    fill: lit === 9 ? "var(--navy-850)" : "var(--sapphire-200)"
  }, label));
}
function Bar({
  pct
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "slaf-bar"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: `${clamp(pct, 0, 100)}%`
    }
  }));
}

/* ---------- Field ------------------------------------------------------
   Empty is null, never 0 (SPEC.md §5 rule 1 and §4). The input is a text
   box, not a number spinner, so an empty string stays an empty string and
   a stray scroll cannot silently change a balance.                      */
function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder
}) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : entered(value) ? String(value) : "";
  return /*#__PURE__*/React.createElement("label", {
    className: "slaf-field",
    style: {
      marginBottom: 0
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "slaf-label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "slaf-input-shell"
  }, prefix && /*#__PURE__*/React.createElement("span", {
    className: "slaf-affix"
  }, prefix), /*#__PURE__*/React.createElement("input", {
    type: "text",
    inputMode: "decimal",
    value: shown,
    placeholder: placeholder || "—",
    onChange: e => setDraft(e.target.value),
    onBlur: () => {
      if (draft === null) return;
      const cleaned = draft.replace(/[$,%\s]/g, "");
      onChange(cleaned === "" ? null : Number.isFinite(Number(cleaned)) ? Number(cleaned) : null);
      setDraft(null);
    },
    onKeyDown: e => {
      if (e.key === "Enter") e.currentTarget.blur();
    }
  }), suffix && /*#__PURE__*/React.createElement("span", {
    className: "slaf-affix"
  }, suffix)));
}

/* ---------- Borrowed ---------------------------------------------------
   A figure this room reads but does not own. It renders as a link to the
   room that does — the same rule the Snapshot follows. Before this, income,
   expenses, cash and the match cap were all editable here AND elsewhere,
   which meant editing them here silently diverged from the household.  */
function Borrowed({
  fieldId,
  label
}) {
  const [household, setHousehold] = useState(() => Spine.getProfile());
  useEffect(() => Spine.onChange(setHousehold), []);
  const d = Ownership.describe(fieldId, household, ROOM_ID);
  if (!d) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "slaf-field",
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "slaf-label"
  }, label || d.label), /*#__PURE__*/React.createElement("a", {
    className: "slaf-owned slaf-owned--field" + (d.isSet ? "" : " slaf-owned--empty"),
    href: d.href
  }, /*#__PURE__*/React.createElement("span", {
    className: "slaf-owned-value"
  }, d.display), /*#__PURE__*/React.createElement("span", {
    className: "slaf-owned-from"
  }, d.ownerTitle + " →")));
}
function Toggle({
  label,
  on,
  onChange
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(!on),
    className: "slaf-btn",
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "left"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      display: "inline-block",
      width: 36,
      height: 20,
      borderRadius: 10,
      background: on ? "var(--color-accent)" : "var(--navy-600)",
      transition: "background 200ms",
      flexShrink: 0,
      marginLeft: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 2,
      left: on ? 18 : 2,
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: "white",
      transition: "left 200ms"
    }
  })));
}

/* ======================================================================= */

function App() {
  /* --- Borrowed from the household. NOT state: derived live on every
         render and re-derived whenever the spine changes, so this room can
         never hold a stale copy of a number another room owns.          */
  const [household, setHousehold] = useState(() => Spine.getProfile());
  useEffect(() => Spine.onChange(setHousehold), []);
  const asDollars = result => Money.isOk(result) ? result.value / 100 : null;
  const incomeVal = asDollars(Schema.grossAnnualIncomeCents(household)); // annual
  const expTotal = asDollars(Schema.monthlyExpensesCents(household)); // monthly
  const efBalance = asDollars(Schema.cashCents(household));
  const age = Schema.primaryAge(household);
  const primarySource = Schema.allIncomeSources(household)[0];
  const matchCapPct = primarySource && entered(primarySource.employerMatch.matchCapPercentOfSalary) ? primarySource.employerMatch.matchCapPercentOfSalary * 100 : null;
  const debts = Schema.aggregatableDebts(household).filter(d => entered(d.balanceCents) && d.balanceCents > 0).map((d, i) => ({
    id: d.id || 'h' + i,
    name: d.label || 'Debt',
    balance: d.balanceCents / 100,
    apr: entered(d.rate) ? Math.round(d.rate * 10000) / 100 : null,
    min: entered(d.minPaymentCents) ? d.minPaymentCents / 100 : null
  }));

  /* --- This room's OWN inputs. Nothing else in the app holds these, so
         they are editable here and start empty. SPEC.md §5.1.          */
  const [cashOnHand, setCashOnHand] = useState(null);
  const [deductibleTarget, setDeductibleTarget] = useState(null);
  const [contribPct, setContribPct] = useState(null);
  const [rothCur, setRothCur] = useState(null);
  const [hsaCur, setHsaCur] = useState(null);
  const [prepaidTarget, setPrepaidTarget] = useState(null);
  const [prepaidBal, setPrepaidBal] = useState(null);
  const [windfallAmt, setWindfallAmt] = useState(null);

  /* --- Assumption-class. Defaults are legitimate here, and visible. ---- */
  const [efMonths, setEfMonths] = useState(ASSUMPTIONS.efMonths);
  const [growthRate, setGrowthRate] = useState(ASSUMPTIONS.growthRate);
  const [limits, setLimits] = useState(FALLBACK_LIMITS);

  /* --- View state ------------------------------------------------------ */
  const [hdhp, setHdhp] = useState(false);
  const [hsaFamilyPlan, setHsaFamilyPlan] = useState(false);
  const [growthOn, setGrowthOn] = useState(false);
  const [windfallOn, setWindfallOn] = useState(false);
  const [showWindfall, setShowWindfall] = useState(false);
  const [showInputs, setShowInputs] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [openStep, setOpenStep] = useState(null);
  useEffect(() => {
    Spine.registerRoom(ROOM_ID);
    Reference.load(['irsLimits']).then(t => {
      const L = t.irsLimits.limits;
      setLimits({
        k401: L.elective401k,
        k401Catchup: L.elective401kCatchup50Plus,
        ira: L.ira,
        iraCatchup: L.iraCatchup50Plus,
        hsaSelf: L.hsaSelfOnly,
        hsaFamily: L.hsaFamily
      });
    }).catch(() => {/* the fallback limits above already render */});
  }, []);
  function loadExample() {
    /* Only this room's own inputs. The household figures belong to Start
       Here and Debt Payoff — loading them from here would be writing fields
       this room does not own. */
    setDeductibleTarget(3000);
    setCashOnHand(1500);
    setContribPct(3);
    setRothCur(0);
    setHsaCur(0);
    setPrepaidTarget(20000);
    setPrepaidBal(0);
  }
  function clearAll() {
    [setCashOnHand, setDeductibleTarget, setContribPct, setRothCur, setHsaCur, setPrepaidTarget, setPrepaidBal, setWindfallAmt].forEach(fn => fn(null));
  }

  /* --- The gap engine --------------------------------------------------- */
  const mIncome = entered(incomeVal) ? incomeVal / 12 : null;
  const mExpenses = entered(expTotal) ? expTotal : null;
  const gapReady = entered(mIncome) && entered(mExpenses);
  const gap = gapReady ? mIncome - mExpenses : null;

  /* Everything the month-by-month simulation needs before it can run. */
  const simNeeds = [["income", entered(mIncome)], ["monthly expenses", entered(mExpenses)], ["your age", entered(age)], ["cash on hand", entered(cashOnHand)], ["your deductible", entered(deductibleTarget)], ["your contribution %", entered(contribPct)], ["your match cap %", entered(matchCapPct)], ["emergency fund balance", entered(efBalance)], ["Roth contributed so far", entered(rothCur)], ["prepaid goal", entered(prepaidTarget)], ["prepaid balance", entered(prepaidBal)]];
  if (hdhp) simNeeds.push(["HSA contributed so far", entered(hsaCur)]);
  const simMissing = simNeeds.filter(n => !n[1]).map(n => n[0]);
  const simReady = simMissing.length === 0;
  const iraLimit = limits.ira + (entered(age) && age >= 50 ? limits.iraCatchup : 0);
  const k401Limit = limits.k401 + (entered(age) && age >= 50 ? limits.k401Catchup : 0);
  const hsaLimit = hsaFamilyPlan ? limits.hsaFamily : limits.hsaSelf;

  /* --- Simulation. Runs only once every input it reads has been entered,
         so nothing inside it has to defend against a null. --------------- */
  const sim = useMemo(() => {
    if (!simReady) return {
      baseline: null,
      windDone: null,
      windRows: []
    };
    const g = growthOn ? growthRate / 100 / 12 : 0;
    const aIncome = mIncome * 12;
    const liveDebts = debts.filter(d => entered(d.balance) && entered(d.apr)).map(d => ({
      ...d,
      min: entered(d.min) ? d.min : 0
    }));
    const allocate = (amount, st) => {
      let rem = amount;
      const rows = [];
      const s = {
        ...st,
        debts: st.debts.map(d => ({
          ...d
        }))
      };
      const take = need => {
        const a = Math.min(rem, Math.max(0, need));
        rem -= a;
        return a;
      };
      const a1 = take(deductibleTarget - s.cash);
      if (a1 > 0) {
        s.cash += a1;
        rows.push({
          label: "Step 1 · Deductible cash",
          amt: a1
        });
      }
      for (const d of s.debts.filter(d => d.apr > 6 && d.balance > 0).sort((a, b) => b.apr - a.apr)) {
        const p = take(d.balance);
        if (p > 0) {
          d.balance -= p;
          rows.push({
            label: `Step 3 · Pay off ${d.name}`,
            amt: p
          });
        }
        if (rem <= 0) break;
      }
      const a4 = take(efMonths * mExpenses - s.ef);
      if (a4 > 0) {
        s.ef += a4;
        rows.push({
          label: "Step 4 · Emergency reserves",
          amt: a4
        });
      }
      const a5 = take(iraLimit - s.rothCur);
      if (a5 > 0) {
        s.rothCur += a5;
        rows.push({
          label: "Step 5 · Fill Roth IRA",
          amt: a5
        });
      }
      if (hdhp) {
        const a5b = take(hsaLimit - s.hsaCur);
        if (a5b > 0) {
          s.hsaCur += a5b;
          rows.push({
            label: "Step 5 · Fill HSA",
            amt: a5b
          });
        }
      }
      const a8 = take(prepaidTarget - s.prepaid);
      if (a8 > 0) {
        s.prepaid += a8;
        rows.push({
          label: "Step 8 · Prepaid future expenses",
          amt: a8
        });
      }
      for (const d of s.debts.filter(d => d.apr <= 6 && d.balance > 0).sort((a, b) => b.apr - a.apr)) {
        const p = take(d.balance);
        if (p > 0) {
          d.balance -= p;
          rows.push({
            label: `Step 9 · Pay down ${d.name}`,
            amt: p
          });
        }
        if (rem <= 0) break;
      }
      if (rem > 0) rows.push({
        label: "Step 7 · Taxable brokerage (the rest)",
        amt: rem
      });
      return {
        state: s,
        rows
      };
    };
    const runSim = init => {
      const s2need = Math.max(0, (matchCapPct - contribPct) / 100 * mIncome);
      const s5need = Math.max(0, iraLimit - init.rothCur + (hdhp ? Math.max(0, hsaLimit - init.hsaCur) : 0)) / 12;
      const employeeAfterMatch = Math.max(contribPct, matchCapPct) / 100 * aIncome;
      const s6need = Math.max(0, k401Limit - employeeAfterMatch) / 12;
      const flowsAt25 = employeeAfterMatch / 12 + (iraLimit + (hdhp ? hsaLimit : 0)) / 12 + Math.max(0, k401Limit - employeeAfterMatch) / 12;
      const s7need = Math.max(0, 0.25 * mIncome - flowsAt25);
      const done = Array(9).fill(null);
      let cash = init.cash,
        ef = init.ef,
        prepaid = init.prepaid;
      let dbts = init.debts.map(d => ({
        ...d
      }));
      let committed = 0,
        step = 0;
      const advance = m => {
        while (step < 9) {
          const av = gap - committed;
          let ok = false;
          if (step === 0 && cash >= deductibleTarget) ok = true;else if (step === 1) {
            if (s2need <= 0) ok = true;else if (av >= s2need) {
              committed += s2need;
              ok = true;
            }
          } else if (step === 2 && !dbts.some(d => d.apr > 6 && d.balance > 0.5)) ok = true;else if (step === 3 && ef >= efMonths * mExpenses) ok = true;else if (step === 4) {
            if (s5need <= 0) ok = true;else if (av >= s5need) {
              committed += s5need;
              ok = true;
            }
          } else if (step === 5) {
            if (s6need <= 0) ok = true;else if (av >= s6need) {
              committed += s6need;
              ok = true;
            }
          } else if (step === 6) {
            if (s7need <= 0) ok = true;else if (av >= s7need) {
              committed += s7need;
              ok = true;
            }
          } else if (step === 7 && prepaid >= prepaidTarget) ok = true;else if (step === 8 && !dbts.some(d => d.apr <= 6 && d.balance > 0.5)) ok = true;
          if (!ok) return;
          done[step] = m;
          step++;
        }
      };
      advance(0);
      if (gap > 0) {
        for (let m = 1; m <= 600 && step < 9; m++) {
          dbts.forEach(d => {
            if (d.balance > 0) d.balance = Math.max(0, d.balance * (1 + d.apr / 1200) - d.min);
          });
          if (g > 0) prepaid *= 1 + g;
          const avail = gap - committed;
          if (avail <= 0) break;
          if (step === 0) cash += avail;else if (step === 2) {
            let pool = avail;
            for (const d of dbts.filter(x => x.apr > 6 && x.balance > 0).sort((a, b) => b.apr - a.apr)) {
              const pay = Math.min(pool, d.balance);
              d.balance -= pay;
              pool -= pay;
              if (pool <= 0) break;
            }
          } else if (step === 3) ef += avail;else if (step === 7) prepaid += avail;else if (step === 8) {
            let pool = avail;
            for (const d of dbts.filter(x => x.apr <= 6 && x.balance > 0).sort((a, b) => b.apr - a.apr)) {
              const pay = Math.min(pool, d.balance);
              d.balance -= pay;
              pool -= pay;
              if (pool <= 0) break;
            }
          }
          advance(m);
        }
      }
      return done;
    };
    const baseState = {
      cash: cashOnHand,
      ef: efBalance,
      prepaid: prepaidBal,
      rothCur,
      hsaCur: entered(hsaCur) ? hsaCur : 0,
      debts: liveDebts
    };
    const baseline = runSim(baseState);
    let windRows = [],
      windDone = baseline;
    if (windfallOn && entered(windfallAmt) && windfallAmt > 0) {
      const alloc = allocate(windfallAmt, baseState);
      windRows = alloc.rows;
      windDone = runSim(alloc.state);
    }
    return {
      baseline,
      windDone,
      windRows
    };
  }, [simReady, mIncome, mExpenses, gap, age, cashOnHand, deductibleTarget, contribPct, matchCapPct, efBalance, efMonths, hdhp, hsaFamilyPlan, rothCur, hsaCur, prepaidTarget, prepaidBal, growthOn, growthRate, limits, debts, windfallOn, windfallAmt]);
  const active = windfallOn ? sim.windDone : sim.baseline;
  const completedNow = active ? active.filter(d => d === 0).length : null;
  const curIdx = active ? active.findIndex(d => d !== 0) === -1 ? 8 : active.findIndex(d => d !== 0) : -1;
  const ratedDebts = debts.filter(d => entered(d.balance) && entered(d.apr) && d.balance > 0);
  const highDebts = ratedDebts.filter(d => d.apr > 6);
  const lowDebts = ratedDebts.filter(d => d.apr <= 6);
  const s2gapMo = entered(matchCapPct) && entered(contribPct) && entered(mIncome) ? Math.max(0, (matchCapPct - contribPct) / 100 * mIncome) : null;
  const windTotal = sim.windRows.reduce((s, r) => s + r.amt, 0);

  /* --- Step cards. Each declares what it needs; a card whose inputs are
         missing says so rather than deriving a figure from nothing. ----- */
  const steps = [{
    n: 1,
    title: "Deductibles covered",
    needs: [entered(cashOnHand), entered(deductibleTarget)],
    missing: "your cash on hand and your highest deductible",
    why: "Before anything else, hold enough cash to cover your largest insurance deductible — health, auto, or home. It's the smallest wall between you and new debt.",
    build: () => ({
      sub: cashOnHand >= deductibleTarget ? `${fmt(cashOnHand)} on hand covers your ${fmt(deductibleTarget)} deductible.` : `${fmt(deductibleTarget - cashOnHand)} short of your highest deductible.`,
      pct: clamp(cashOnHand / Math.max(1, deductibleTarget) * 100, 0, 100),
      act: cashOnHand < deductibleTarget ? `Stack cash to ${fmt(deductibleTarget)} first.` : "Covered. Keep this cash untouched."
    })
  }, {
    n: 2,
    title: "Employer match",
    needs: [entered(s2gapMo), entered(matchCapPct)],
    missing: "your income, contribution % and match cap %",
    why: "A match is an instant 50-100% return. Nothing else compounds a raise like this.",
    build: () => ({
      sub: s2gapMo <= 0 ? `Full match captured at ${contribPct}%.` : `Raise contribution ${(matchCapPct - contribPct).toFixed(1)}% — costs ${fmt(s2gapMo)}/mo, returns free money.`,
      pct: matchCapPct === 0 ? 100 : clamp(contribPct / matchCapPct * 100, 0, 100),
      act: s2gapMo > 0 ? `Set payroll deferral to ${matchCapPct}%.` : "Keep it flowing every paycheck."
    })
  }, {
    n: 3,
    title: "High-interest debt",
    needs: [true],
    missing: "",
    why: "Paying 23% APR off is a guaranteed 23% return. Destroy this before investing further.",
    build: () => ({
      sub: debts.length === 0 ? "No debts entered." : highDebts.length === 0 ? "No high-interest debt. Clear." : `${fmt(highDebts.reduce((s, d) => s + d.balance, 0))} above 6% APR — highest ${Math.max(...highDebts.map(d => d.apr)).toFixed(1)}%.`,
      pct: highDebts.length === 0 ? 100 : 0,
      act: highDebts.length ? "Waterfall attacks highest APR first (avalanche)." : "Stay clear."
    })
  }, {
    n: 4,
    title: "Emergency reserves",
    needs: [entered(efBalance), entered(mExpenses)],
    missing: "your emergency fund balance and monthly expenses",
    why: "3-6 months of expenses turns a job loss into an inconvenience instead of a crisis.",
    build: () => ({
      sub: efBalance >= efMonths * mExpenses ? `${(mExpenses > 0 ? efBalance / mExpenses : 0).toFixed(1)} months held — target met.` : `${(mExpenses > 0 ? efBalance / mExpenses : 0).toFixed(1)} of ${efMonths} months. ${fmt(efMonths * mExpenses - efBalance)} to go.`,
      pct: clamp(efBalance / Math.max(1, efMonths * mExpenses) * 100, 0, 100),
      act: "High-yield savings, automated, boring on purpose."
    })
  }, {
    n: 5,
    title: "Roth IRA & HSA",
    needs: [entered(rothCur), !hdhp || entered(hsaCur)],
    missing: hdhp ? "what you've put into your Roth IRA and HSA this year" : "what you've put into your Roth IRA this year",
    why: "Tax-free growth forever (Roth) and the triple-tax-advantaged HSA. Fill these before returning to 401k.",
    build: () => ({
      sub: rothCur >= iraLimit && (!hdhp || hsaCur >= hsaLimit) ? "Both maxed for the year." : `Roth ${fmt(rothCur)} of ${fmt(iraLimit)}${hdhp ? ` · HSA ${fmt(hsaCur)} of ${fmt(hsaLimit)}` : ""}`,
      pct: clamp((rothCur + (hdhp ? hsaCur : 0)) / Math.max(1, iraLimit + (hdhp ? hsaLimit : 0)) * 100, 0, 100),
      act: hdhp ? "Automate both — HSA via payroll for the FICA break." : "Automate the Roth monthly."
    })
  }, {
    n: 6,
    title: "Max-out retirement",
    needs: [entered(contribPct), entered(matchCapPct), entered(mIncome)],
    missing: "your income and contribution percentages",
    why: "Fill every remaining tax-advantaged dollar: 401k, 403b, 457. Shelter beats taxable.",
    build: () => ({
      sub: "Fill remaining 401k/403b space to the employee limit.",
      pct: clamp(Math.max(contribPct, matchCapPct) / 100 * mIncome * 12 / Math.max(1, k401Limit) * 100, 0, 100),
      act: "Raise deferral until the IRS limit."
    })
  }, {
    n: 7,
    title: "Hyperaccumulation",
    needs: [entered(contribPct), entered(matchCapPct)],
    missing: "your contribution percentages",
    why: "The Money Guy north star: 25% of gross saved. Past tax shelters this spills into taxable brokerage — your army of dollar bills.",
    build: () => ({
      sub: "Reach 25% of gross income savings rate; overflow to taxable brokerage.",
      pct: clamp(Math.max(contribPct, matchCapPct) / 100 / 0.25 * 100, 0, 100),
      act: "Automate into low-cost index funds."
    })
  }, {
    n: 8,
    title: "Prepaid future expenses",
    needs: [entered(prepaidBal), entered(prepaidTarget)],
    missing: "your future-goal target and what's saved toward it",
    why: "Only after your retirement is secured do you prepay the future. Oxygen mask on yourself first.",
    build: () => ({
      sub: prepaidBal >= prepaidTarget ? "Future goals funded." : `${fmt(prepaidBal)} of ${fmt(prepaidTarget)} toward 529s, weddings, next car.`,
      pct: clamp(prepaidBal / Math.max(1, prepaidTarget) * 100, 0, 100),
      act: "529s gain state tax perks in most states."
    })
  }, {
    n: 9,
    title: "Low-interest debt prepayment",
    needs: [true],
    missing: "",
    why: "Math says low-rate debt can wait — but a paid-off house is peace the spreadsheet can't price.",
    build: () => ({
      sub: debts.length === 0 ? "No debts entered." : lowDebts.length === 0 ? "No low-interest debt remains." : `${fmt(lowDebts.reduce((s, d) => s + d.balance, 0))} at 6% or below — mortgage-tier debt, last on purpose.`,
      pct: lowDebts.length === 0 ? 100 : 0,
      act: "Extra principal payments until free."
    })
  }];
  const label = {
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "var(--tracking-eyebrow)",
    color: "var(--color-text-subtle)",
    display: "block",
    marginBottom: 4
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "wrap"
  }, /*#__PURE__*/React.createElement("a", {
    className: "back",
    href: "map.html"
  }, "\u2190 All rooms"), /*#__PURE__*/React.createElement("header", {
    style: {
      paddingTop: 16,
      paddingBottom: 20,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(GemCrown, {
    litCount: completedNow
  })), /*#__PURE__*/React.createElement("h1", null, "Financial Order of Operations"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--color-text-subtle)",
      fontSize: "var(--text-base)",
      marginTop: 4
    }
  }, "Nine steps, in the exact order you need.")), /*#__PURE__*/React.createElement("div", {
    className: "actions",
    style: {
      display: "flex",
      gap: "var(--space-2)",
      marginBottom: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "slaf-btn",
    onClick: loadExample
  }, "Try with example numbers"), /*#__PURE__*/React.createElement("button", {
    className: "slaf-btn slaf-btn--quiet",
    onClick: clearAll
  }, "Clear")), /*#__PURE__*/React.createElement("div", {
    className: "card card-active",
    style: {
      padding: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement(Borrowed, {
    fieldId: "grossAnnualIncome",
    label: "Income"
  }), /*#__PURE__*/React.createElement(Borrowed, {
    fieldId: "monthlyExpenses",
    label: "Expenses"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: "var(--radius-md)",
      background: "rgba(8,24,51,0.6)",
      border: "1px solid var(--color-border-strong)",
      padding: "var(--space-3)",
      textAlign: "center",
      marginTop: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      ...label,
      marginBottom: 0
    }
  }, "Your gap \u2014 fuels the waterfall"), gapReady ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "slaf-figure",
    style: {
      margin: "4px 0",
      color: gap > 0 ? "var(--sapphire-100)" : "var(--color-critical)"
    }
  }, gap >= 0 ? "+" : "−", fmt(gap), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-md)",
      color: "var(--color-accent-hover)"
    }
  }, "/mo")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--color-accent-hover)",
      margin: 0
    }
  }, fmt(mIncome), "/mo in \xB7 ", fmt(mExpenses), "/mo out", gap <= 0 && " — a negative gap blocks every step.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "slaf-figure slaf-figure--incomplete",
    style: {
      margin: "4px 0"
    }
  }, "\u2014"), /*#__PURE__*/React.createElement("p", {
    className: "needs",
    style: {
      margin: 0
    }
  }, "Add your income and expenses above.")))), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: "var(--space-4)",
      borderColor: windfallOn ? "var(--color-caution)" : "var(--color-border)",
      background: windfallOn ? "rgba(232,184,75,0.08)" : "var(--color-surface)"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "row-btn",
    style: {
      padding: 0
    },
    onClick: () => setShowWindfall(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, "Windfall", windfallOn && entered(windfallAmt) ? ` — ${fmt(windfallAmt)} applied` : ""), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-accent-hover)"
    }
  }, showWindfall ? "Hide" : "Open")), showWindfall && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--color-text-muted)",
      marginTop: 0
    }
  }, "Bonus, inheritance, tax refund \u2014 drop a lump sum in and it pours through the FOO in strict order at month zero. Every step's date recalculates."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Amount",
    value: windfallAmt,
    onChange: setWindfallAmt,
    prefix: "$",
    placeholder: "e.g. 10000"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Toggle, {
    label: windfallOn ? "Applied" : "Apply it",
    on: windfallOn,
    onChange: setWindfallOn
  }))), windfallOn && sim.windRows.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-3)",
      fontSize: "var(--text-sm)"
    }
  }, sim.windRows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 0",
      borderTop: i ? "1px solid var(--color-border)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-text-muted)"
    }
  }, r.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: "tabular-nums"
    }
  }, fmt(r.amt)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      padding: "8px 0 0",
      borderTop: "1px solid var(--color-border-strong)",
      marginTop: 4,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", null, "Allocated"), /*#__PURE__*/React.createElement("span", null, fmt(windTotal)))))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("button", {
    className: "row-btn",
    onClick: () => setShowInputs(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, "Your situation"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-accent-hover)"
    }
  }, showInputs ? "Hide" : "Edit")), showInputs && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-4) var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid2",
    style: {
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Borrowed, {
    fieldId: "age",
    label: "Age"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Cash on hand",
    value: cashOnHand,
    onChange: setCashOnHand,
    prefix: "$",
    placeholder: "e.g. 1500"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Highest deductible",
    value: deductibleTarget,
    onChange: setDeductibleTarget,
    prefix: "$",
    placeholder: "e.g. 3000"
  }), /*#__PURE__*/React.createElement(Borrowed, {
    fieldId: "cashSavings",
    label: "Emergency fund"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "You contribute",
    value: contribPct,
    onChange: setContribPct,
    suffix: "%",
    placeholder: "e.g. 4"
  }), /*#__PURE__*/React.createElement(Borrowed, {
    fieldId: "employerMatch",
    label: "Employer match"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Roth so far this yr",
    value: rothCur,
    onChange: setRothCur,
    prefix: "$",
    placeholder: "e.g. 3000"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Prepaid goal",
    value: prepaidTarget,
    onChange: setPrepaidTarget,
    prefix: "$",
    placeholder: "e.g. 20000"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Saved toward it",
    value: prepaidBal,
    onChange: setPrepaidBal,
    prefix: "$",
    placeholder: "e.g. 0"
  }), hdhp && /*#__PURE__*/React.createElement(Field, {
    label: "HSA so far this yr",
    value: hsaCur,
    onChange: setHsaCur,
    prefix: "$",
    placeholder: "e.g. 0"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)",
      marginBottom: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Toggle, {
    label: "I'm on a high-deductible health plan (HSA eligible)",
    on: hdhp,
    onChange: setHdhp
  }), hdhp && /*#__PURE__*/React.createElement(Toggle, {
    label: "Family HSA coverage",
    on: hsaFamilyPlan,
    onChange: setHsaFamilyPlan
  }), /*#__PURE__*/React.createElement(Toggle, {
    label: "Grow prepaid savings while they sit",
    on: growthOn,
    onChange: setGrowthOn
  })), /*#__PURE__*/React.createElement("span", {
    style: label
  }, "Debts"), /*#__PURE__*/React.createElement("p", {
    className: "needs",
    style: {
      marginTop: 0
    }
  }, "Read from your itemised debts. ", /*#__PURE__*/React.createElement("a", {
    href: Ownership.linkTo('debt-payoff', 'debts'),
    style: {
      color: "var(--color-accent-hover)"
    }
  }, "Edit them in Debt Payoff \u2192")), debts.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "needs",
    style: {
      marginTop: 0
    }
  }, "No debts entered yet."), debts.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.id,
    style: {
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--color-border)",
      padding: "var(--space-3)",
      marginBottom: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "center",
      marginBottom: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: "var(--text-base)"
    }
  }, d.name), entered(d.apr) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-xs)",
      padding: "2px 8px",
      borderRadius: "999px",
      background: d.apr > 6 ? "rgba(229,72,77,0.2)" : "rgba(30,58,138,0.5)",
      color: d.apr > 6 ? "var(--color-critical)" : "var(--color-text-muted)"
    }
  }, d.apr > 6 ? "Step 3" : "Step 9")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      fontSize: "var(--text-sm)",
      color: "var(--color-text-muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, /*#__PURE__*/React.createElement("span", null, entered(d.balance) ? fmt(d.balance) : "—"), /*#__PURE__*/React.createElement("span", null, entered(d.apr) ? d.apr + "%" : "—"), /*#__PURE__*/React.createElement("span", null, entered(d.min) ? fmt(d.min) + "/mo" : "—", " min")))))), !simReady && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: label
  }, "Timeline"), /*#__PURE__*/React.createElement("p", {
    className: "needs",
    style: {
      marginBottom: 0
    }
  }, "The month-by-month projection needs a few more numbers: ", simMissing.join(", "), ". Each step below still shows whatever it can from what you've entered.")), steps.map((s, i) => {
    const ready = s.needs.every(Boolean);
    const built = ready ? s.build() : null;
    const landed = active ? active[i] : null;
    const isCurrent = simReady && i === curIdx;
    return /*#__PURE__*/React.createElement("div", {
      key: s.n,
      className: "card" + (isCurrent ? " card-active" : "")
    }, /*#__PURE__*/React.createElement("button", {
      className: "row-btn",
      onClick: () => setOpenStep(openStep === i ? null : i)
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...label,
        marginBottom: 2
      }
    }, "Step ", s.n), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, s.title), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontSize: "var(--text-sm)",
        color: ready ? "var(--color-text-muted)" : "var(--color-text-faint)",
        marginTop: 2
      }
    }, ready ? built.sub : `Add ${s.missing} to see this.`)), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "right",
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-xs)",
        color: "var(--color-accent-hover)"
      }
    }, simReady ? monthLabel(landed) : "—"))), ready && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 var(--space-4) var(--space-3)"
      }
    }, /*#__PURE__*/React.createElement(Bar, {
      pct: built.pct
    })), openStep === i && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 var(--space-4) var(--space-4)",
        fontSize: "var(--text-sm)",
        color: "var(--color-text-muted)"
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        marginTop: 0
      }
    }, s.why), ready && /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--color-text)",
        margin: 0
      }
    }, /*#__PURE__*/React.createElement("strong", null, "Do this:"), " ", built.act)));
  }), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement("button", {
    className: "row-btn",
    onClick: () => setShowAssumptions(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, "Assumptions & 2026 IRS limits"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-accent-hover)"
    }
  }, showAssumptions ? "Hide" : "Edit")), showAssumptions && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-4) var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "needs",
    style: {
      marginTop: 0
    }
  }, "These carry system defaults because they're assumptions, not facts about you. Limits load from ", /*#__PURE__*/React.createElement("code", null, "data/irs_limits_2026.json"), "."), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Emergency fund target",
    value: efMonths,
    onChange: v => setEfMonths(entered(v) ? v : ASSUMPTIONS.efMonths),
    suffix: "mo"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Growth on prepaid savings",
    value: growthRate,
    onChange: v => setGrowthRate(entered(v) ? v : ASSUMPTIONS.growthRate),
    suffix: "%"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "401k limit",
    value: limits.k401,
    onChange: v => setLimits({
      ...limits,
      k401: v
    }),
    prefix: "$"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "401k catch-up 50+",
    value: limits.k401Catchup,
    onChange: v => setLimits({
      ...limits,
      k401Catchup: v
    }),
    prefix: "$"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "IRA limit",
    value: limits.ira,
    onChange: v => setLimits({
      ...limits,
      ira: v
    }),
    prefix: "$"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "IRA catch-up 50+",
    value: limits.iraCatchup,
    onChange: v => setLimits({
      ...limits,
      iraCatchup: v
    }),
    prefix: "$"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "HSA self",
    value: limits.hsaSelf,
    onChange: v => setLimits({
      ...limits,
      hsaSelf: v
    }),
    prefix: "$"
  }), /*#__PURE__*/React.createElement(Field, {
    label: "HSA family",
    value: limits.hsaFamily,
    onChange: v => setLimits({
      ...limits,
      hsaFamily: v
    }),
    prefix: "$"
  })))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-xs)",
      color: "var(--color-text-faint)",
      textAlign: "center",
      marginTop: "var(--space-6)",
      lineHeight: "var(--leading-loose)"
    }
  }, "Inspired by The Money Guy Show's Financial Order of Operations. Educational tool, not financial advice. Your numbers stay in this browser.")));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));