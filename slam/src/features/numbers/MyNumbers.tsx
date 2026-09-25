/* My Numbers: the combined dashboard. Big numbers, one bar chart, the
   three biggest levers for business #1, and what is still missing. */
import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { toKeepAfterSetAside } from '@/engine/aggregate';
import { runwayMonths } from '@/engine/formulas';
import { sensitivity } from '@/engine/sensitivity';
import { Bars } from '../shared/Bars';
import { Basis, Big, Button, Card, Empty, Note } from '../shared/ui';
import { useModel, useSellableHours, useTotals } from '../shared/hooks';
import { count, money } from '../shared/format';

export function MyNumbers() {
  const profile = useAppStore((s) => s.profile);
  const model = useModel();
  const totals = useTotals();
  const sellable = useSellableHours();
  const first = model?.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0];
  const levers = useMemo(() => (first ? sensitivity(first, sellable).slice(0, 3) : []), [first, sellable]);
  if (!profile || !model) return null;
  if (!model.businesses.some((b) => b.active)) {
    return (
      <Card title="My Numbers">
        <Empty>Nothing to add up yet. Tick the businesses you run first.</Empty>
        <div className="mt-3">
          <Button to="businesses/setup">Go to Setup</Button>
        </div>
      </Card>
    );
  }
  if (!totals || !totals.ok) {
    return (
      <Card title="My Numbers" testId="numbers-incomplete">
        <Note tone="warn">Not enough to add up yet. Missing: {totals && !totals.ok ? totals.missing.join(', ') : ''}.</Note>
        <div className="mt-3">
          <Button to="businesses" kind="secondary">
            Fill them in
          </Button>
        </div>
      </Card>
    );
  }
  const t = totals.value;
  const tax = profile.settings.taxSetAsideRate?.value ?? null;
  const keep = tax === null ? null : toKeepAfterSetAside(t.profitCents, tax);
  const cash = profile.settings.cashOnHandCents?.value ?? null;
  const goal = profile.settings.incomeGoalCents?.value ?? null;
  const runway = cash !== null && goal !== null ? runwayMonths(cash, goal, t.profitCents) : null;
  const rows = t.businesses.map((b) => ({ label: b.name, value: b.month.grossProfitCents, emphasis: b.priority === 1 }));
  const top = t.businesses[0];

  return (
    <div className="space-y-4">
      <Card title="This month" testId="numbers-card">
        <div className="grid grid-cols-2 gap-4">
          <Big label="Profit" value={money(t.profitCents, { whole: true })} tone={t.profitCents >= 0 ? 'good' : 'warn'} testId="profit" />
          <Big label="Gross profit" value={money(t.grossProfitCents, { whole: true })} testId="gross-profit" />
          <Big label="Fixed costs" value={money(t.fixedCostsCents, { whole: true })} />
          <Big label="Hours used" value={sellable === null ? count(t.hoursUsed, 0) : `${count(t.hoursUsed, 0)} of ${count(sellable, 0)}`} sub={sellable === null ? 'set your hours in settings' : undefined} />
        </div>
        {keep && <p className="mt-3 text-sm">After a {Math.round(tax! * 100)}% tax set-aside: <strong>{money(keep.toKeepCents, { whole: true })}</strong> to keep, {money(keep.setAsideCents, { whole: true })} put aside.</p>}
        {goal !== null && (
          <p className="mt-1 text-sm" data-testid="goal-line">
            {t.profitCents >= goal ? `Above your ${money(goal, { whole: true })} goal.` : `${money(goal - t.profitCents, { whole: true })} short of your ${money(goal, { whole: true })} goal.`}
            {runway && runway.months !== null ? ` Cash on hand covers ${count(runway.months, 1)} months of that gap.` : ''}
          </p>
        )}
        <Basis basedOn={totals.basedOn} testId="numbers-basis" />
      </Card>

      <Card title="Where it comes from">
        <Bars rows={rows} format={(v) => money(v, { whole: true })} summary={`${top?.name ?? ''} brings ${Math.round((top?.shareOfGp ?? 0) * 100)}% of gross profit${rows.length > 1 ? `; ${rows.length} businesses counted, in your priority order` : ''}.`} testId="share-bars" />
        {t.businesses.some((b) => b.month.hoursLimited) && <Note tone="warn">Some businesses got fewer hours than they asked for; #1 takes its hours first.</Note>}
      </Card>

      {levers.length > 0 && first && (
        <Card title={`Biggest levers for ${first.name}`} testId="levers">
          <ul className="space-y-2">
            {levers.map((l) => (
              <li key={l.key} className="flex items-baseline justify-between text-sm">
                <span>
                  {l.label} <span className="text-slate-500">{l.move}</span>
                </span>
                <span className="font-semibold tabular-nums">{money(l.deltaCents, { sign: true, whole: true })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Profit change a month from one small move. Screening is not on this list on purpose.</p>
        </Card>
      )}
    </div>
  );
}
