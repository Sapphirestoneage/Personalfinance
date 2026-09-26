/* My Numbers: the combined dashboard. Big numbers, one bar chart, the
   three biggest levers for business #1, and what is still missing. */
import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { toKeepAfterSetAside } from '@/engine/aggregate';
import { runwayMonths } from '@/engine/formulas';
import { sensitivity, leverBasisWord } from '@/engine/sensitivity';
import { checkInsVsModel } from '@/engine/reality';
import { useState } from 'react';
import { Viz } from '../shared/Viz';
import { Basis, Big, Button, Card, Empty, Note } from '../shared/ui';
import { MissingList } from '../shared/MissingList';
import { useModel, useSellableHours, useTotals } from '../shared/hooks';
import { count, money } from '../shared/format';

function WeeksChart() {
  const weekLogs = useAppStore((s) => s.weekLogs);
  const saved = useMemo(() => weekLogs.filter((w) => w.checkedIn && !w.businessId).slice(0, 8).reverse(), [weekLogs]);
  if (saved.length < 2) return null;
  const rows = saved.map((w) => ({ label: w.weekStart.slice(5), value: w.inquiries ?? 0, emphasis: w === saved[saved.length - 1] }));
  const bookings = saved.map((w) => w.bookings ?? 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const best = rows.reduce((b, r) => (r.value > b.value ? r : b), rows[0]!);
  return (
    <Card title={`Contacts by week, last ${saved.length} check-ins`} testId="weeks-chart">
      <Viz id="weeks" testId="weeks-viz" kinds={['column', 'line', 'bar']} rows={rows} format={(v) => count(v, 0)} summary={`${total} contacts over ${saved.length} weeks, best week ${best.label} with ${best.value}. Bookings those weeks: ${bookings.join(', ')}.`} />
    </Card>
  );
}

function RealityCheck({ firstId }: { firstId: string | undefined }) {
  const weekLogs = useAppStore((s) => s.weekLogs);
  const setInput = useAppStore((s) => s.setInput);
  const model = useModel();
  const [used, setUsed] = useState(false);
  const first = model?.businesses.find((b) => b.id === firstId) ?? null;
  const r = useMemo(() => checkInsVsModel(weekLogs, first), [weekLogs, first]);
  if (!first || r.weeks === 0) return null;
  const key = first.type === 'inPerson' ? 'inquiriesPerMonth' : first.type === 'calls' ? 'callsPerMonth' : null;
  return (
    <Card title={`Your last ${r.weeks} check-in${r.weeks === 1 ? '' : 's'} vs the model`} testId="reality">
      <ul className="space-y-1 text-sm">
        {r.contactsPerMonth !== null && (
          <li data-testid="reality-contacts">
            Contacts: about <strong>{count(r.contactsPerMonth, 0)}</strong> a month logged{r.modelContactsPerMonth !== null ? `, model says ${count(r.modelContactsPerMonth, 0)}` : ''}
            {r.contactsGap !== null ? ` (${r.contactsGap >= 0 ? '+' : ''}${Math.round(r.contactsGap * 100)}%)` : ''}.
          </li>
        )}
        {r.bookingsPerMonth !== null && <li>Bookings: about {count(r.bookingsPerMonth, 0)} a month.</li>}
        {r.sessionsPerMonth !== null && <li>Sessions or calls held: about {count(r.sessionsPerMonth, 0)} a month.</li>}
        {r.reachPerWeek !== null && <li>Reach actions: about {count(r.reachPerWeek, 0)} a week.</li>}
      </ul>
      {key && r.contactsPerMonth !== null && r.contactsGap !== null && Math.abs(r.contactsGap) > 0.1 && (
        <div className="mt-3">
          {used ? (
            <Note tone="good">Your model now uses what you logged.</Note>
          ) : (
            <Button kind="secondary" testId="use-checkins" onClick={() => void setInput(first.id, key, Math.round(r.contactsPerMonth!), 'Yours', 'from your check-ins').then(() => setUsed(true))}>
              Use {count(r.contactsPerMonth, 0)} a month in my numbers
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

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
      <Card title="My Numbers">
        <MissingList keys={totals && !totals.ok ? totals.missing : []} testId="numbers-incomplete" />
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

      <Card title="Where the month goes" testId="month-viz">
        <Viz
          id="month"
          kinds={['column', 'bar']}
          rows={[
            { label: 'Gross profit', value: t.grossProfitCents },
            { label: 'Fixed costs', value: -t.fixedCostsCents },
            ...(t.acquisitionSpendCents > 0 ? [{ label: 'Finding clients', value: -t.acquisitionSpendCents }] : []),
            { label: 'Profit', value: t.profitCents, emphasis: true },
          ]}
          format={(v) => money(v, { whole: true })}
          summary={`${money(t.grossProfitCents, { whole: true })} of gross profit, less ${money(t.fixedCostsCents, { whole: true })} of fixed costs${t.acquisitionSpendCents > 0 ? ` and ${money(t.acquisitionSpendCents, { whole: true })} spent finding clients` : ''}, leaves ${money(t.profitCents, { whole: true })}.`}
        />
      </Card>

      {sellable !== null && t.businesses.length > 0 && (
        <Card title="Where the hours go" testId="hours-viz">
          <Viz
            id="hours"
            kinds={['donut', 'bar', 'column']}
            rows={[...t.businesses.map((b) => ({ label: b.name, value: Math.round(b.month.hoursUsed), emphasis: b.priority === 1 })), ...(sellable - t.hoursUsed > 0 ? [{ label: 'Free', value: Math.round(sellable - t.hoursUsed) }] : [])]}
            format={(v) => `${count(v, 0)} h`}
            summary={`${count(t.hoursUsed, 0)} of ${count(sellable, 0)} sellable hours a month are spoken for${sellable - t.hoursUsed > 0 ? `; ${count(sellable - t.hoursUsed, 0)} are free` : '; none are free'}.`}
          />
        </Card>
      )}

      <RealityCheck firstId={first?.id} />
      <WeeksChart />

      <Card title="Where it comes from">
        <Viz id="share" testId="share-bars" kinds={['donut', 'bar', 'column']} rows={rows} format={(v) => money(v, { whole: true })} summary={`${top?.name ?? ''} brings ${Math.round((top?.shareOfGp ?? 0) * 100)}% of gross profit${rows.length > 1 ? `; ${rows.length} businesses counted, in your priority order` : ''}.`} />
        {t.businesses.some((b) => b.month.hoursLimited) && <Note tone="warn">Some businesses got fewer hours than they asked for; #1 takes its hours first.</Note>}
      </Card>

      {levers.length > 0 && first && (
        <Card title={`Biggest levers for ${first.name}`} testId="levers">
          <Viz id="levers" testId="levers-viz" kinds={['bar', 'column']} rows={levers.map((l, i) => ({ label: `${l.label} ${l.move}`, value: l.deltaCents, emphasis: i === 0 }))} format={(v) => money(v, { sign: true, whole: true })} summary={`Change in ${leverBasisWord(first.type)} from one small move.${first.type === 'inPerson' ? ' Screening is not on this list on purpose.' : ''}`} />
        </Card>
      )}
    </div>
  );
}
