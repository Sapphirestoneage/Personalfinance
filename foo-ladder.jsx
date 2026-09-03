const { useState, useMemo, useEffect } = React;
const { Money, Schema, Spine, Reference, DemoPersona } = SLAF;

const ROOM_ID = 'foo-ladder';

/* Assumption-class defaults (SPEC.md §3). These are not facts about the
   visitor, so unlike every raw input they legitimately carry a default —
   each one is visible and editable below. */
const ASSUMPTIONS = { efMonths: 3, growthRate: 7 };

/* Fallback IRS limits, replaced by data/irs_limits_2026.json once it loads.
   Kept only so the app renders before the fetch resolves. */
const FALLBACK_LIMITS = { k401: 24500, k401Catchup: 8000, ira: 7500, iraCatchup: 1100, hsaSelf: 4400, hsaFamily: 8750 };

const START = { m: 6, y: 2026 };
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const EXPENSE_CATS = ["Housing","Transportation","Food","Insurance","Debt minimums","Everything else"];

const fmt = (n) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const entered = (v) => Money.isEntered(v);

const monthLabel = (m) => {
  if (m === null) return "Blocked";
  if (m <= 0) return "Now";
  const total = START.m + m;
  const y = START.y + Math.floor(total / 12);
  return `${MONTH_NAMES[total % 12]} '${String(y).slice(2)} · ${m} mo`;
};

/* ---------- 9-facet sapphire, one facet per FOO step -------------------- */
function GemCrown({ litCount }) {
  const cx = 60, cy = 60, rOuter = 54, rInner = 21;
  const facets = [];
  for (let i = 0; i < 9; i++) {
    const a1 = ((i * 40 - 90) * Math.PI) / 180;
    const a2 = (((i + 1) * 40 - 90) * Math.PI) / 180;
    facets.push({ i, d: `M${cx+rOuter*Math.cos(a1)},${cy+rOuter*Math.sin(a1)} L${cx+rOuter*Math.cos(a2)},${cy+rOuter*Math.sin(a2)} L${cx+rInner*Math.cos(a2)},${cy+rInner*Math.sin(a2)} L${cx+rInner*Math.cos(a1)},${cy+rInner*Math.sin(a1)} Z` });
  }
  const lit = litCount === null ? 0 : litCount;
  const label = litCount === null ? "—" : `${lit}/9`;
  return (
    <svg viewBox="0 0 120 120" style={{ width: 96, height: 96 }}
         aria-label={litCount === null ? "Not enough entered to score the ladder" : `${lit} of 9 steps complete`}>
      {facets.map(f => (
        <path key={f.i} d={f.d}
          fill={f.i < lit ? "var(--sapphire-500)" : "var(--navy-700)"}
          stroke="var(--navy-850)" strokeWidth="1.5"
          style={{ transition: "fill 500ms ease" }} opacity={f.i < lit ? 1 : 0.55} />
      ))}
      <circle cx={cx} cy={cy} r={rInner} fill={lit === 9 ? "var(--sapphire-200)" : "var(--navy-750)"}
              stroke="var(--navy-850)" strokeWidth="1.5" style={{ transition: "fill 500ms ease" }} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="15" fontWeight="600"
            fontFamily="var(--font-body)" fill={lit === 9 ? "var(--navy-850)" : "var(--sapphire-200)"}>{label}</text>
    </svg>
  );
}

function Bar({ pct }) {
  return (
    <div className="slaf-bar">
      <span style={{ width: `${clamp(pct, 0, 100)}%` }} />
    </div>
  );
}

/* ---------- Field ------------------------------------------------------
   Empty is null, never 0 (SPEC.md §5 rule 1 and §4). The input is a text
   box, not a number spinner, so an empty string stays an empty string and
   a stray scroll cannot silently change a balance.                      */
function Field({ label, value, onChange, prefix, suffix, placeholder }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : (entered(value) ? String(value) : "");
  return (
    <label className="slaf-field" style={{ marginBottom: 0 }}>
      {label && <span className="slaf-label">{label}</span>}
      <span className="slaf-input-shell">
        {prefix && <span className="slaf-affix">{prefix}</span>}
        <input type="text" inputMode="decimal" value={shown}
          placeholder={placeholder || "—"}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === null) return;
            const cleaned = draft.replace(/[$,%\s]/g, "");
            onChange(cleaned === "" ? null : (Number.isFinite(Number(cleaned)) ? Number(cleaned) : null));
            setDraft(null);
          }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        {suffix && <span className="slaf-affix">{suffix}</span>}
      </span>
    </label>
  );
}

function Toggle({ label, on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} className="slaf-btn"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <span style={{ textAlign: "left" }}>{label}</span>
      <span style={{ position: "relative", display: "inline-block", width: 36, height: 20, borderRadius: 10,
        background: on ? "var(--color-accent)" : "var(--navy-600)", transition: "background 200ms", flexShrink: 0, marginLeft: 12 }}>
        <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: "50%",
          background: "white", transition: "left 200ms" }} />
      </span>
    </button>
  );
}

function PeriodSwitch({ period, onChange }) {
  return (
    <div style={{ display: "inline-flex", borderRadius: var_pill(), border: "1px solid var(--color-border-strong)",
      background: "var(--color-surface-raised)", padding: 2, fontSize: "var(--text-xs)" }}>
      {["monthly", "yearly"].map(p => (
        <button key={p} onClick={() => onChange(p)} style={{ padding: "4px 12px", borderRadius: 16, border: "none",
          cursor: "pointer", background: period === p ? "var(--color-accent)" : "transparent",
          color: period === p ? "var(--color-accent-contrast)" : "var(--color-text-muted)",
          fontWeight: period === p ? 600 : 400, textTransform: "capitalize", fontFamily: "var(--font-body)" }}>{p}</button>
      ))}
    </div>
  );
}
function var_pill() { return "999px"; }

/* ======================================================================= */

function App() {
  /* --- Raw inputs. Every one starts empty. SPEC.md §5.1. --------------- */
  const [incomePeriod, setIncomePeriod] = useState("yearly");
  const [incomeVal, setIncomeVal] = useState(null);
  const [expPeriod, setExpPeriod] = useState("monthly");
  const [useBreakdown, setUseBreakdown] = useState(false);
  const [expTotal, setExpTotal] = useState(null);
  const [expCats, setExpCats] = useState({});
  const [age, setAge] = useState(null);
  const [cashOnHand, setCashOnHand] = useState(null);
  const [deductibleTarget, setDeductibleTarget] = useState(null);
  const [contribPct, setContribPct] = useState(null);
  const [matchCapPct, setMatchCapPct] = useState(null);
  const [efBalance, setEfBalance] = useState(null);
  const [rothCur, setRothCur] = useState(null);
  const [hsaCur, setHsaCur] = useState(null);
  const [prepaidTarget, setPrepaidTarget] = useState(null);
  const [prepaidBal, setPrepaidBal] = useState(null);
  const [windfallAmt, setWindfallAmt] = useState(null);
  const [debts, setDebts] = useState([]);

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
  const [seeded, setSeeded] = useState(false);

  const addDebt = () => setDebts(d => [...d, { id: Date.now(), name: "New debt", balance: null, apr: null, min: null }]);
  const setDebt = (id, key, val) => setDebts(d => d.map(x => x.id === id ? { ...x, [key]: val } : x));
  const rmDebt = (id) => setDebts(d => d.filter(x => x.id !== id));

  /* --- Seed from the shared household ---------------------------------
     If the visitor already filled in the Financial Snapshot, this room
     opens with THEIR numbers rather than a stranger's. That is the whole
     point of the spine. Nothing is invented — a field the household has no
     value for stays empty.                                             */
  function seedFrom(h) {
    const income = Schema.grossAnnualIncomeCents(h);
    if (Money.isOk(income)) { setIncomeVal(income.value / 100); setIncomePeriod("yearly"); }
    const exp = Schema.monthlyExpensesCents(h);
    if (Money.isOk(exp)) { setExpTotal(exp.value / 100); setExpPeriod("monthly"); setUseBreakdown(false); }
    const cash = Schema.cashCents(h);
    if (Money.isOk(cash)) { setEfBalance(cash.value / 100); }
    const a = Schema.primaryAge(h);
    if (entered(a)) setAge(a);
    const src = Schema.allIncomeSources(h)[0];
    if (src && entered(src.employerMatch.matchCapPercentOfSalary)) {
      setMatchCapPct(src.employerMatch.matchCapPercentOfSalary * 100);
    }
    const itemised = Schema.aggregatableDebts(h).filter(d => entered(d.balanceCents) && d.balanceCents > 0);
    if (itemised.length) {
      setDebts(itemised.map((d, i) => ({
        id: 'h' + i,
        name: d.label || 'Debt',
        balance: d.balanceCents / 100,
        apr: entered(d.rate) ? Math.round(d.rate * 10000) / 100 : null,
        min: entered(d.minPaymentCents) ? d.minPaymentCents / 100 : null
      })));
    }
  }

  useEffect(() => {
    Spine.registerRoom(ROOM_ID);
    seedFrom(Spine.getProfile());
    setSeeded(true);
    Reference.load(['irsLimits']).then(t => {
      const L = t.irsLimits.limits;
      setLimits({
        k401: L.elective401k, k401Catchup: L.elective401kCatchup50Plus,
        ira: L.ira, iraCatchup: L.iraCatchup50Plus,
        hsaSelf: L.hsaSelfOnly, hsaFamily: L.hsaFamily
      });
    }).catch(() => { /* the fallback limits above already render */ });
  }, []);

  function loadExample() {
    const h = DemoPersona.build();
    seedFrom(h);
    setDeductibleTarget(3000);
    setCashOnHand(1500);
    setContribPct(3);
    setRothCur(0);
    setHsaCur(0);
    setPrepaidTarget(20000);
    setPrepaidBal(0);
  }

  function clearAll() {
    [setIncomeVal, setExpTotal, setAge, setCashOnHand, setDeductibleTarget, setContribPct,
     setMatchCapPct, setEfBalance, setRothCur, setHsaCur, setPrepaidTarget, setPrepaidBal,
     setWindfallAmt].forEach(fn => fn(null));
    setExpCats({}); setDebts([]);
  }

  /* --- The gap engine --------------------------------------------------- */
  const catEntries = Object.values(expCats).filter(entered);
  const catSum = catEntries.length ? catEntries.reduce((s, v) => s + v, 0) : null;
  const rawExp = useBreakdown ? catSum : expTotal;

  const mIncome = entered(incomeVal) ? (incomePeriod === "yearly" ? incomeVal / 12 : incomeVal) : null;
  const mExpenses = entered(rawExp) ? (expPeriod === "yearly" ? rawExp / 12 : rawExp) : null;
  const gapReady = entered(mIncome) && entered(mExpenses);
  const gap = gapReady ? mIncome - mExpenses : null;

  /* Everything the month-by-month simulation needs before it can run. */
  const simNeeds = [
    ["income", entered(mIncome)], ["monthly expenses", entered(mExpenses)],
    ["your age", entered(age)], ["cash on hand", entered(cashOnHand)],
    ["your deductible", entered(deductibleTarget)],
    ["your contribution %", entered(contribPct)], ["your match cap %", entered(matchCapPct)],
    ["emergency fund balance", entered(efBalance)],
    ["Roth contributed so far", entered(rothCur)],
    ["prepaid goal", entered(prepaidTarget)], ["prepaid balance", entered(prepaidBal)]
  ];
  if (hdhp) simNeeds.push(["HSA contributed so far", entered(hsaCur)]);
  const simMissing = simNeeds.filter(n => !n[1]).map(n => n[0]);
  const simReady = simMissing.length === 0;

  const iraLimit = limits.ira + (entered(age) && age >= 50 ? limits.iraCatchup : 0);
  const k401Limit = limits.k401 + (entered(age) && age >= 50 ? limits.k401Catchup : 0);
  const hsaLimit = hsaFamilyPlan ? limits.hsaFamily : limits.hsaSelf;

  /* --- Simulation. Runs only once every input it reads has been entered,
         so nothing inside it has to defend against a null. --------------- */
  const sim = useMemo(() => {
    if (!simReady) return { baseline: null, windDone: null, windRows: [] };
    const g = growthOn ? growthRate / 100 / 12 : 0;
    const aIncome = mIncome * 12;
    const liveDebts = debts.filter(d => entered(d.balance) && entered(d.apr))
      .map(d => ({ ...d, min: entered(d.min) ? d.min : 0 }));

    const allocate = (amount, st) => {
      let rem = amount; const rows = [];
      const s = { ...st, debts: st.debts.map(d => ({ ...d })) };
      const take = (need) => { const a = Math.min(rem, Math.max(0, need)); rem -= a; return a; };
      const a1 = take(deductibleTarget - s.cash); if (a1 > 0) { s.cash += a1; rows.push({ label: "Step 1 · Deductible cash", amt: a1 }); }
      for (const d of s.debts.filter(d => d.apr > 6 && d.balance > 0).sort((a, b) => b.apr - a.apr)) {
        const p = take(d.balance); if (p > 0) { d.balance -= p; rows.push({ label: `Step 3 · Pay off ${d.name}`, amt: p }); }
        if (rem <= 0) break;
      }
      const a4 = take(efMonths * mExpenses - s.ef); if (a4 > 0) { s.ef += a4; rows.push({ label: "Step 4 · Emergency reserves", amt: a4 }); }
      const a5 = take(iraLimit - s.rothCur); if (a5 > 0) { s.rothCur += a5; rows.push({ label: "Step 5 · Fill Roth IRA", amt: a5 }); }
      if (hdhp) { const a5b = take(hsaLimit - s.hsaCur); if (a5b > 0) { s.hsaCur += a5b; rows.push({ label: "Step 5 · Fill HSA", amt: a5b }); } }
      const a8 = take(prepaidTarget - s.prepaid); if (a8 > 0) { s.prepaid += a8; rows.push({ label: "Step 8 · Prepaid future expenses", amt: a8 }); }
      for (const d of s.debts.filter(d => d.apr <= 6 && d.balance > 0).sort((a, b) => b.apr - a.apr)) {
        const p = take(d.balance); if (p > 0) { d.balance -= p; rows.push({ label: `Step 9 · Pay down ${d.name}`, amt: p }); }
        if (rem <= 0) break;
      }
      if (rem > 0) rows.push({ label: "Step 7 · Taxable brokerage (the rest)", amt: rem });
      return { state: s, rows };
    };

    const runSim = (init) => {
      const s2need = Math.max(0, ((matchCapPct - contribPct) / 100) * mIncome);
      const s5need = Math.max(0, iraLimit - init.rothCur + (hdhp ? Math.max(0, hsaLimit - init.hsaCur) : 0)) / 12;
      const employeeAfterMatch = (Math.max(contribPct, matchCapPct) / 100) * aIncome;
      const s6need = Math.max(0, k401Limit - employeeAfterMatch) / 12;
      const flowsAt25 = employeeAfterMatch / 12 + (iraLimit + (hdhp ? hsaLimit : 0)) / 12 + Math.max(0, k401Limit - employeeAfterMatch) / 12;
      const s7need = Math.max(0, 0.25 * mIncome - flowsAt25);
      const done = Array(9).fill(null);
      let cash = init.cash, ef = init.ef, prepaid = init.prepaid;
      let dbts = init.debts.map(d => ({ ...d }));
      let committed = 0, step = 0;
      const advance = (m) => {
        while (step < 9) {
          const av = gap - committed; let ok = false;
          if (step === 0 && cash >= deductibleTarget) ok = true;
          else if (step === 1) { if (s2need <= 0) ok = true; else if (av >= s2need) { committed += s2need; ok = true; } }
          else if (step === 2 && !dbts.some(d => d.apr > 6 && d.balance > 0.5)) ok = true;
          else if (step === 3 && ef >= efMonths * mExpenses) ok = true;
          else if (step === 4) { if (s5need <= 0) ok = true; else if (av >= s5need) { committed += s5need; ok = true; } }
          else if (step === 5) { if (s6need <= 0) ok = true; else if (av >= s6need) { committed += s6need; ok = true; } }
          else if (step === 6) { if (s7need <= 0) ok = true; else if (av >= s7need) { committed += s7need; ok = true; } }
          else if (step === 7 && prepaid >= prepaidTarget) ok = true;
          else if (step === 8 && !dbts.some(d => d.apr <= 6 && d.balance > 0.5)) ok = true;
          if (!ok) return; done[step] = m; step++;
        }
      };
      advance(0);
      if (gap > 0) {
        for (let m = 1; m <= 600 && step < 9; m++) {
          dbts.forEach(d => { if (d.balance > 0) d.balance = Math.max(0, d.balance * (1 + d.apr / 1200) - d.min); });
          if (g > 0) prepaid *= 1 + g;
          const avail = gap - committed; if (avail <= 0) break;
          if (step === 0) cash += avail;
          else if (step === 2) { let pool = avail; for (const d of dbts.filter(x => x.apr > 6 && x.balance > 0).sort((a, b) => b.apr - a.apr)) { const pay = Math.min(pool, d.balance); d.balance -= pay; pool -= pay; if (pool <= 0) break; } }
          else if (step === 3) ef += avail;
          else if (step === 7) prepaid += avail;
          else if (step === 8) { let pool = avail; for (const d of dbts.filter(x => x.apr <= 6 && x.balance > 0).sort((a, b) => b.apr - a.apr)) { const pay = Math.min(pool, d.balance); d.balance -= pay; pool -= pay; if (pool <= 0) break; } }
          advance(m);
        }
      }
      return done;
    };

    const baseState = { cash: cashOnHand, ef: efBalance, prepaid: prepaidBal, rothCur, hsaCur: entered(hsaCur) ? hsaCur : 0, debts: liveDebts };
    const baseline = runSim(baseState);
    let windRows = [], windDone = baseline;
    if (windfallOn && entered(windfallAmt) && windfallAmt > 0) {
      const alloc = allocate(windfallAmt, baseState);
      windRows = alloc.rows; windDone = runSim(alloc.state);
    }
    return { baseline, windDone, windRows };
  }, [simReady, mIncome, mExpenses, gap, age, cashOnHand, deductibleTarget, contribPct, matchCapPct,
      efBalance, efMonths, hdhp, hsaFamilyPlan, rothCur, hsaCur, prepaidTarget, prepaidBal,
      growthOn, growthRate, limits, debts, windfallOn, windfallAmt]);

  const active = windfallOn ? sim.windDone : sim.baseline;
  const completedNow = active ? active.filter(d => d === 0).length : null;
  const curIdx = active ? (active.findIndex(d => d !== 0) === -1 ? 8 : active.findIndex(d => d !== 0)) : -1;

  const ratedDebts = debts.filter(d => entered(d.balance) && entered(d.apr) && d.balance > 0);
  const highDebts = ratedDebts.filter(d => d.apr > 6);
  const lowDebts = ratedDebts.filter(d => d.apr <= 6);
  const s2gapMo = (entered(matchCapPct) && entered(contribPct) && entered(mIncome))
    ? Math.max(0, ((matchCapPct - contribPct) / 100) * mIncome) : null;
  const windTotal = sim.windRows.reduce((s, r) => s + r.amt, 0);

  /* --- Step cards. Each declares what it needs; a card whose inputs are
         missing says so rather than deriving a figure from nothing. ----- */
  const steps = [
    { n: 1, title: "Deductibles covered", needs: [entered(cashOnHand), entered(deductibleTarget)],
      missing: "your cash on hand and your highest deductible",
      why: "Before anything else, hold enough cash to cover your largest insurance deductible — health, auto, or home. It's the smallest wall between you and new debt.",
      build: () => ({
        sub: cashOnHand >= deductibleTarget ? `${fmt(cashOnHand)} on hand covers your ${fmt(deductibleTarget)} deductible.` : `${fmt(deductibleTarget - cashOnHand)} short of your highest deductible.`,
        pct: clamp((cashOnHand / Math.max(1, deductibleTarget)) * 100, 0, 100),
        act: cashOnHand < deductibleTarget ? `Stack cash to ${fmt(deductibleTarget)} first.` : "Covered. Keep this cash untouched." }) },

    { n: 2, title: "Employer match", needs: [entered(s2gapMo), entered(matchCapPct)],
      missing: "your income, contribution % and match cap %",
      why: "A match is an instant 50-100% return. Nothing else compounds a raise like this.",
      build: () => ({
        sub: s2gapMo <= 0 ? `Full match captured at ${contribPct}%.` : `Raise contribution ${(matchCapPct - contribPct).toFixed(1)}% — costs ${fmt(s2gapMo)}/mo, returns free money.`,
        pct: matchCapPct === 0 ? 100 : clamp((contribPct / matchCapPct) * 100, 0, 100),
        act: s2gapMo > 0 ? `Set payroll deferral to ${matchCapPct}%.` : "Keep it flowing every paycheck." }) },

    { n: 3, title: "High-interest debt", needs: [true],
      missing: "", why: "Paying 23% APR off is a guaranteed 23% return. Destroy this before investing further.",
      build: () => ({
        sub: debts.length === 0 ? "No debts entered." : highDebts.length === 0 ? "No high-interest debt. Clear." : `${fmt(highDebts.reduce((s, d) => s + d.balance, 0))} above 6% APR — highest ${Math.max(...highDebts.map(d => d.apr)).toFixed(1)}%.`,
        pct: highDebts.length === 0 ? 100 : 0,
        act: highDebts.length ? "Waterfall attacks highest APR first (avalanche)." : "Stay clear." }) },

    { n: 4, title: "Emergency reserves", needs: [entered(efBalance), entered(mExpenses)],
      missing: "your emergency fund balance and monthly expenses",
      why: "3-6 months of expenses turns a job loss into an inconvenience instead of a crisis.",
      build: () => ({
        sub: efBalance >= efMonths * mExpenses ? `${(mExpenses > 0 ? efBalance / mExpenses : 0).toFixed(1)} months held — target met.` : `${(mExpenses > 0 ? efBalance / mExpenses : 0).toFixed(1)} of ${efMonths} months. ${fmt(efMonths * mExpenses - efBalance)} to go.`,
        pct: clamp((efBalance / Math.max(1, efMonths * mExpenses)) * 100, 0, 100),
        act: "High-yield savings, automated, boring on purpose." }) },

    { n: 5, title: "Roth IRA & HSA", needs: [entered(rothCur), !hdhp || entered(hsaCur)],
      missing: hdhp ? "what you've put into your Roth IRA and HSA this year" : "what you've put into your Roth IRA this year",
      why: "Tax-free growth forever (Roth) and the triple-tax-advantaged HSA. Fill these before returning to 401k.",
      build: () => ({
        sub: rothCur >= iraLimit && (!hdhp || hsaCur >= hsaLimit) ? "Both maxed for the year." : `Roth ${fmt(rothCur)} of ${fmt(iraLimit)}${hdhp ? ` · HSA ${fmt(hsaCur)} of ${fmt(hsaLimit)}` : ""}`,
        pct: clamp(((rothCur + (hdhp ? hsaCur : 0)) / Math.max(1, iraLimit + (hdhp ? hsaLimit : 0))) * 100, 0, 100),
        act: hdhp ? "Automate both — HSA via payroll for the FICA break." : "Automate the Roth monthly." }) },

    { n: 6, title: "Max-out retirement", needs: [entered(contribPct), entered(matchCapPct), entered(mIncome)],
      missing: "your income and contribution percentages",
      why: "Fill every remaining tax-advantaged dollar: 401k, 403b, 457. Shelter beats taxable.",
      build: () => ({
        sub: "Fill remaining 401k/403b space to the employee limit.",
        pct: clamp((((Math.max(contribPct, matchCapPct) / 100) * mIncome * 12) / Math.max(1, k401Limit)) * 100, 0, 100),
        act: "Raise deferral until the IRS limit." }) },

    { n: 7, title: "Hyperaccumulation", needs: [entered(contribPct), entered(matchCapPct)],
      missing: "your contribution percentages",
      why: "The Money Guy north star: 25% of gross saved. Past tax shelters this spills into taxable brokerage — your army of dollar bills.",
      build: () => ({
        sub: "Reach 25% of gross income savings rate; overflow to taxable brokerage.",
        pct: clamp(((Math.max(contribPct, matchCapPct) / 100) / 0.25) * 100, 0, 100),
        act: "Automate into low-cost index funds." }) },

    { n: 8, title: "Prepaid future expenses", needs: [entered(prepaidBal), entered(prepaidTarget)],
      missing: "your future-goal target and what's saved toward it",
      why: "Only after your retirement is secured do you prepay the future. Oxygen mask on yourself first.",
      build: () => ({
        sub: prepaidBal >= prepaidTarget ? "Future goals funded." : `${fmt(prepaidBal)} of ${fmt(prepaidTarget)} toward 529s, weddings, next car.`,
        pct: clamp((prepaidBal / Math.max(1, prepaidTarget)) * 100, 0, 100),
        act: "529s gain state tax perks in most states." }) },

    { n: 9, title: "Low-interest debt prepayment", needs: [true],
      missing: "", why: "Math says low-rate debt can wait — but a paid-off house is peace the spreadsheet can't price.",
      build: () => ({
        sub: debts.length === 0 ? "No debts entered." : lowDebts.length === 0 ? "No low-interest debt remains." : `${fmt(lowDebts.reduce((s, d) => s + d.balance, 0))} at 6% or below — mortgage-tier debt, last on purpose.`,
        pct: lowDebts.length === 0 ? 100 : 0,
        act: "Extra principal payments until free." }) }
  ];

  const label = { fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-eyebrow)", color: "var(--color-text-subtle)", display: "block", marginBottom: 4 };

  return (
    <div className="page">
      <div className="wrap">
        <a className="back" href="map.html">← All rooms</a>

        <header style={{ paddingTop: 16, paddingBottom: 20, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <GemCrown litCount={completedNow} />
          </div>
          <h1>Financial Order of Operations</h1>
          <p style={{ color: "var(--color-text-subtle)", fontSize: "var(--text-base)", marginTop: 4 }}>
            Nine steps, in the exact order you need.
          </p>
        </header>

        <div className="actions" style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          <button className="slaf-btn" onClick={loadExample}>Try with example numbers</button>
          <button className="slaf-btn slaf-btn--quiet" onClick={clearAll}>Clear</button>
        </div>

        {/* GAP ENGINE */}
        <div className="card card-active" style={{ padding: "var(--space-4)" }}>
          <div className="grid2">
            <div>
              <span style={label}>Income</span>
              <PeriodSwitch period={incomePeriod} onChange={setIncomePeriod} />
              <div style={{ marginTop: 8 }}>
                <Field value={incomeVal} onChange={setIncomeVal} prefix="$"
                  suffix={incomePeriod === "yearly" ? "/yr" : "/mo"}
                  placeholder={incomePeriod === "yearly" ? "e.g. 72000" : "e.g. 6000"} />
              </div>
            </div>
            <div>
              <span style={label}>Expenses</span>
              <PeriodSwitch period={expPeriod} onChange={setExpPeriod} />
              <div style={{ marginTop: 8 }}>
                {!useBreakdown && <Field value={expTotal} onChange={setExpTotal} prefix="$"
                  suffix={expPeriod === "yearly" ? "/yr" : "/mo"}
                  placeholder={expPeriod === "yearly" ? "e.g. 37800" : "e.g. 3150"} />}
                {useBreakdown && <div className="slaf-input-shell">
                  <span style={{ padding: "8px 0" }}>{entered(catSum) ? fmt(catSum) : "—"}</span>
                  <span className="slaf-affix">{expPeriod === "yearly" ? "/yr" : "/mo"}</span>
                </div>}
              </div>
            </div>
          </div>

          <button className="link-btn" onClick={() => setUseBreakdown(v => !v)}>
            {useBreakdown ? "Use a single total instead" : "Break expenses into categories"}
          </button>
          {useBreakdown && <div className="grid2">
            {EXPENSE_CATS.map(c => (
              <Field key={c} label={c} value={expCats[c]} placeholder="e.g. 500"
                onChange={v => setExpCats({ ...expCats, [c]: v })} prefix="$" />
            ))}
          </div>}

          <div style={{ borderRadius: "var(--radius-md)", background: "rgba(8,24,51,0.6)",
            border: "1px solid var(--color-border-strong)", padding: "var(--space-3)",
            textAlign: "center", marginTop: "var(--space-3)" }}>
            <p style={{ ...label, marginBottom: 0 }}>Your gap — fuels the waterfall</p>
            {gapReady ? (
              <>
                <p className="slaf-figure" style={{ margin: "4px 0", color: gap > 0 ? "var(--sapphire-100)" : "var(--color-critical)" }}>
                  {gap >= 0 ? "+" : "−"}{fmt(gap)}<span style={{ fontSize: "var(--text-md)", color: "var(--color-accent-hover)" }}>/mo</span>
                </p>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-accent-hover)", margin: 0 }}>
                  {fmt(mIncome)}/mo in · {fmt(mExpenses)}/mo out{gap <= 0 && " — a negative gap blocks every step."}
                </p>
              </>
            ) : (
              <>
                <p className="slaf-figure slaf-figure--incomplete" style={{ margin: "4px 0" }}>—</p>
                <p className="needs" style={{ margin: 0 }}>Add your income and expenses above.</p>
              </>
            )}
          </div>
        </div>

        {/* WINDFALL */}
        <div className="card" style={{ padding: "var(--space-4)",
          borderColor: windfallOn ? "var(--color-caution)" : "var(--color-border)",
          background: windfallOn ? "rgba(232,184,75,0.08)" : "var(--color-surface)" }}>
          <button className="row-btn" style={{ padding: 0 }} onClick={() => setShowWindfall(v => !v)}>
            <span style={{ fontWeight: 500 }}>
              Windfall{windfallOn && entered(windfallAmt) ? ` — ${fmt(windfallAmt)} applied` : ""}
            </span>
            <span style={{ color: "var(--color-accent-hover)" }}>{showWindfall ? "Hide" : "Open"}</span>
          </button>
          {showWindfall && <div style={{ marginTop: "var(--space-3)" }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginTop: 0 }}>
              Bonus, inheritance, tax refund — drop a lump sum in and it pours through the FOO in strict
              order at month zero. Every step's date recalculates.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <Field label="Amount" value={windfallAmt} onChange={setWindfallAmt} prefix="$" placeholder="e.g. 10000" />
              </div>
              <div style={{ flex: 1 }}>
                <Toggle label={windfallOn ? "Applied" : "Apply it"} on={windfallOn} onChange={setWindfallOn} />
              </div>
            </div>
            {windfallOn && sim.windRows.length > 0 && <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
              {sim.windRows.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0",
                  borderTop: i ? "1px solid var(--color-border)" : "none" }}>
                  <span style={{ color: "var(--color-text-muted)" }}>{r.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.amt)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0",
                borderTop: "1px solid var(--color-border-strong)", marginTop: 4, fontWeight: 600 }}>
                <span>Allocated</span><span>{fmt(windTotal)}</span>
              </div>
            </div>}
          </div>}
        </div>

        {/* INPUTS */}
        <div className="card">
          <button className="row-btn" onClick={() => setShowInputs(v => !v)}>
            <span style={{ fontWeight: 500 }}>Your situation</span>
            <span style={{ color: "var(--color-accent-hover)" }}>{showInputs ? "Hide" : "Edit"}</span>
          </button>
          {showInputs && <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
            <div className="grid2" style={{ marginBottom: "var(--space-3)" }}>
              <Field label="Age" value={age} onChange={setAge} placeholder="e.g. 32" />
              <Field label="Cash on hand" value={cashOnHand} onChange={setCashOnHand} prefix="$" placeholder="e.g. 1500" />
              <Field label="Highest deductible" value={deductibleTarget} onChange={setDeductibleTarget} prefix="$" placeholder="e.g. 3000" />
              <Field label="Emergency fund" value={efBalance} onChange={setEfBalance} prefix="$" placeholder="e.g. 6800" />
              <Field label="You contribute" value={contribPct} onChange={setContribPct} suffix="%" placeholder="e.g. 4" />
              <Field label="Match capped at" value={matchCapPct} onChange={setMatchCapPct} suffix="%" placeholder="e.g. 6" />
              <Field label="Roth so far this yr" value={rothCur} onChange={setRothCur} prefix="$" placeholder="e.g. 3000" />
              <Field label="Prepaid goal" value={prepaidTarget} onChange={setPrepaidTarget} prefix="$" placeholder="e.g. 20000" />
              <Field label="Saved toward it" value={prepaidBal} onChange={setPrepaidBal} prefix="$" placeholder="e.g. 0" />
              {hdhp && <Field label="HSA so far this yr" value={hsaCur} onChange={setHsaCur} prefix="$" placeholder="e.g. 0" />}
            </div>
            <div style={{ display: "grid", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <Toggle label="I'm on a high-deductible health plan (HSA eligible)" on={hdhp} onChange={setHdhp} />
              {hdhp && <Toggle label="Family HSA coverage" on={hsaFamilyPlan} onChange={setHsaFamilyPlan} />}
              <Toggle label="Grow prepaid savings while they sit" on={growthOn} onChange={setGrowthOn} />
            </div>

            <span style={label}>Debts</span>
            {debts.length === 0 && <p className="needs" style={{ marginTop: 0 }}>No debts added.</p>}
            {debts.map(d => (
              <div key={d.id} style={{ borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
                padding: "var(--space-3)", marginBottom: "var(--space-2)" }}>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                  <input value={d.name} onChange={e => setDebt(d.id, "name", e.target.value)}
                    style={{ flex: 1, background: "transparent", fontSize: "var(--text-base)", color: "var(--color-text)",
                      outline: "none", border: "none", borderBottom: "1px solid var(--color-border-strong)",
                      paddingBottom: 2, fontFamily: "var(--font-body)" }} />
                  {entered(d.apr) && <span style={{ fontSize: "var(--text-xs)", padding: "2px 8px", borderRadius: "999px",
                    background: d.apr > 6 ? "rgba(229,72,77,0.2)" : "rgba(30,58,138,0.5)",
                    color: d.apr > 6 ? "var(--color-critical)" : "var(--color-text-muted)" }}>
                    {d.apr > 6 ? "Step 3" : "Step 9"}</span>}
                  <button onClick={() => rmDebt(d.id)} style={{ color: "var(--color-accent)", background: "none",
                    border: "none", cursor: "pointer" }}>✕</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-2)" }}>
                  <Field label="Balance" value={d.balance} onChange={v => setDebt(d.id, "balance", v)} prefix="$" placeholder="0" />
                  <Field label="APR" value={d.apr} onChange={v => setDebt(d.id, "apr", v)} suffix="%" placeholder="0" />
                  <Field label="Min /mo" value={d.min} onChange={v => setDebt(d.id, "min", v)} prefix="$" placeholder="0" />
                </div>
              </div>
            ))}
            <button className="slaf-btn" onClick={addDebt} style={{ width: "100%" }}>+ Add a debt</button>
          </div>}
        </div>

        {/* THE LADDER */}
        {!simReady && (
          <div className="card" style={{ padding: "var(--space-4)" }}>
            <span style={label}>Timeline</span>
            <p className="needs" style={{ marginBottom: 0 }}>
              The month-by-month projection needs a few more numbers: {simMissing.join(", ")}.
              Each step below still shows whatever it can from what you've entered.
            </p>
          </div>
        )}

        {steps.map((s, i) => {
          const ready = s.needs.every(Boolean);
          const built = ready ? s.build() : null;
          const landed = active ? active[i] : null;
          const isCurrent = simReady && i === curIdx;
          return (
            <div key={s.n} className={"card" + (isCurrent ? " card-active" : "")}>
              <button className="row-btn" onClick={() => setOpenStep(openStep === i ? null : i)}>
                <span style={{ flex: 1 }}>
                  <span style={{ ...label, marginBottom: 2 }}>Step {s.n}</span>
                  <span style={{ fontWeight: 500 }}>{s.title}</span>
                  <span style={{ display: "block", fontSize: "var(--text-sm)",
                    color: ready ? "var(--color-text-muted)" : "var(--color-text-faint)", marginTop: 2 }}>
                    {ready ? built.sub : `Add ${s.missing} to see this.`}
                  </span>
                </span>
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--color-accent-hover)" }}>
                    {simReady ? monthLabel(landed) : "—"}
                  </span>
                </span>
              </button>
              {ready && <div style={{ padding: "0 var(--space-4) var(--space-3)" }}><Bar pct={built.pct} /></div>}
              {openStep === i && <div style={{ padding: "0 var(--space-4) var(--space-4)",
                fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                <p style={{ marginTop: 0 }}>{s.why}</p>
                {ready && <p style={{ color: "var(--color-text)", margin: 0 }}><strong>Do this:</strong> {built.act}</p>}
              </div>}
            </div>
          );
        })}

        {/* IRS LIMITS */}
        <div className="card">
          <button className="row-btn" onClick={() => setShowAssumptions(v => !v)}>
            <span style={{ fontWeight: 500 }}>Assumptions &amp; 2026 IRS limits</span>
            <span style={{ color: "var(--color-accent-hover)" }}>{showAssumptions ? "Hide" : "Edit"}</span>
          </button>
          {showAssumptions && <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
            <p className="needs" style={{ marginTop: 0 }}>
              These carry system defaults because they're assumptions, not facts about you.
              Limits load from <code>data/irs_limits_2026.json</code>.
            </p>
            <div className="grid2">
              <Field label="Emergency fund target" value={efMonths} onChange={v => setEfMonths(entered(v) ? v : ASSUMPTIONS.efMonths)} suffix="mo" />
              <Field label="Growth on prepaid savings" value={growthRate} onChange={v => setGrowthRate(entered(v) ? v : ASSUMPTIONS.growthRate)} suffix="%" />
              <Field label="401k limit" value={limits.k401} onChange={v => setLimits({ ...limits, k401: v })} prefix="$" />
              <Field label="401k catch-up 50+" value={limits.k401Catchup} onChange={v => setLimits({ ...limits, k401Catchup: v })} prefix="$" />
              <Field label="IRA limit" value={limits.ira} onChange={v => setLimits({ ...limits, ira: v })} prefix="$" />
              <Field label="IRA catch-up 50+" value={limits.iraCatchup} onChange={v => setLimits({ ...limits, iraCatchup: v })} prefix="$" />
              <Field label="HSA self" value={limits.hsaSelf} onChange={v => setLimits({ ...limits, hsaSelf: v })} prefix="$" />
              <Field label="HSA family" value={limits.hsaFamily} onChange={v => setLimits({ ...limits, hsaFamily: v })} prefix="$" />
            </div>
          </div>}
        </div>

        <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)", textAlign: "center",
          marginTop: "var(--space-6)", lineHeight: "var(--leading-loose)" }}>
          Inspired by The Money Guy Show's Financial Order of Operations.
          Educational tool, not financial advice. Your numbers stay in this browser.
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
