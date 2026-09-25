/* Today: one "do this next" card, pathway progress, the check-in. */
import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { nextStep } from '@/engine/pathway';
import { budgetCheck } from '@/engine/budgets';
import { milestoneState, MILESTONES } from '@/engine/reality';
import { useEffect } from 'react';
import { Big, Button, Card, Note } from '../shared/ui';
import { useModel, useTotals } from '../shared/hooks';
import { money } from '../shared/format';
import { CheckIn } from './CheckIn';

export function Today() {
  const profile = useAppStore((s) => s.profile);
  const clients = useAppStore((s) => s.clients);
  const sales = useAppStore((s) => s.sales);
  const weekLogs = useAppStore((s) => s.weekLogs);
  const model = useModel();
  const totals = useTotals();
  const step = useMemo(() => (model && profile ? nextStep(model.businesses, profile.pathway.completedSteps) : null), [model, profile]);
  const flags = useMemo(() => budgetCheck(clients, sales, new Date().toISOString().slice(0, 7)), [clients, sales]);
  const milestones = useAppStore((s) => s.milestones);
  const addMilestone = useAppStore((s) => s.addMilestone);
  const ms = useMemo(() => (profile && model ? milestoneState(profile, model.businesses, clients, milestones) : null), [profile, model, clients, milestones]);
  useEffect(() => {
    if (!ms) return;
    for (const k of ms.achieved) if (!milestones.some((m) => m.key === k)) void addMilestone(k);
  }, [ms, milestones, addMilestone]);
  if (!profile || !model || !step) return null;

  const business = step.businessId ? model.businesses.find((b) => b.id === step.businessId) : null;
  const to = step.stage.tool === 'setup' ? 'businesses/setup' : `toolbox/${step.stage.tool}?guided=1&business=${step.businessId ?? ''}`;
  const anyActive = model.businesses.some((b) => b.active);
  const checkIns = profile.checkInCount;
  const recent = weekLogs.slice(0, 4).map((w) => w.inquiries).filter((n): n is number => n !== null);
  const earlier = weekLogs.slice(4, 8).map((w) => w.inquiries).filter((n): n is number => n !== null);
  const reach = weekLogs.slice(0, 4).map((w) => w.reachActions).filter((n): n is number => n !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const fresh = !anyActive && checkIns === 0;

  return (
    <div className="space-y-4">
      {fresh && (
        <Card testId="welcome">
          <p className="text-lg font-semibold" style={{ textWrap: 'balance' }}>
            Three numbers, then the one thing to fix.
          </p>
          <ol className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
            <li>1. Tick what you run.</li>
            <li>2. Contacts, bookings, price. Everything else starts as a labeled estimate.</li>
            <li>3. See where the money leaks, and the one move that fixes it.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">Nothing leaves this phone. The Hide button at the top swaps the screen for a plain page in one tap.</p>
        </Card>
      )}
      <Card title={step.complete ? 'Pathway complete' : 'Do this next'} testId="next-card">
        <p className="text-lg font-semibold" data-testid="next-title">
          {step.complete ? 'Every stage, every business.' : `${step.stage.title}${business ? ` for ${business.name}` : ''}`}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{step.complete ? 'From here it is the weekly check-in, and a fresh diagnosis whenever a month surprises you.' : step.stage.question}</p>
        <div className="mt-3">
          {step.complete ? (
            <Button to={`toolbox/diagnose?business=${model.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0]?.id ?? ''}`} testId="next-go" kind="secondary">
              Run the diagnosis again
            </Button>
          ) : (
            <Button to={to} testId="next-go">
              {anyActive || step.stage.tool === 'setup' ? `Start (about ${step.stage.minutes} min)` : 'Tick your businesses'}
            </Button>
          )}
        </div>
        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-2 rounded-full bg-sky-600" style={{ width: `${Math.round((step.business ? step.business.done / step.business.total : step.progress) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500" data-testid="progress">
            {step.business && business ? `${business.name}: ${step.business.done} of ${step.business.total} stages done.` : `Pathway: ${step.done} of ${step.total} steps done.`}
            {step.business && model.businesses.filter((b) => b.active).length > 1 ? ` All businesses: ${step.done} of ${step.total}.` : ''}
          </p>
        </div>
      </Card>

      {totals && totals.ok && anyActive && (
        <Card title="This month, as it stands" testId="today-numbers">
          <div className="grid grid-cols-2 gap-4">
            <Big label="Profit" value={money(totals.value.profitCents, { whole: true })} tone={totals.value.profitCents >= 0 ? 'good' : 'warn'} testId="today-profit" />
            <Big label="Gross profit" value={money(totals.value.grossProfitCents, { whole: true })} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{totals.basedOn.allYours ? 'From your numbers.' : 'Mostly estimates still. Each tool you finish replaces some.'}</p>
        </Card>
      )}

      {flags.length > 0 && (
        <Note tone="warn" testId="budget-flags">
          {flags.length === 1 ? `${flags[0]!.alias} is ${money(flags[0]!.overByCents, { whole: true })} past their agreed budget this month. Time for a check-in with them.` : `${flags.length} regulars are past their agreed budgets this month. Time for a check-in with each.`}
        </Note>
      )}

      <CheckIn />

      {ms && (ms.latest || ms.next) && (
        <Card title="Milestones" testId="milestones">
          {ms.latest && (
            <p className="text-sm">
              <span className="mr-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">done</span>
              {ms.latest.title}
            </p>
          )}
          {ms.next && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              <span className="mr-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">next</span>
              {ms.next.next}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">{ms.achieved.length} of {MILESTONES.length} so far.</p>
        </Card>
      )}

      <Card title="Momentum" testId="momentum">
        {checkIns < 4 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Scores appear after 4 check-ins of real numbers. {checkIns} so far.</p>
        ) : (
          <p className="text-sm" data-testid="momentum-text">
            {(() => {
              const a = avg(recent);
              const b = avg(earlier);
              if (a === null) return 'Log contacts in the check-in to see momentum.';
              if (b === null) return `About ${a.toFixed(1)} contacts a week over the last four check-ins.`;
              const d = a - b;
              const r = avg(reach);
              return `${a.toFixed(1)} contacts a week lately, ${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} on the four weeks before.${r !== null && r > 0 ? ` About ${(a / r).toFixed(2)} contacts per reach action; volume is what moves this.` : ''}`;
            })()}
          </p>
        )}
      </Card>
    </div>
  );
}
