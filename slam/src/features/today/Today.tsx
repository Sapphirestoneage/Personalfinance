/* Today: one "do this next" card, pathway progress, the check-in. */
import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { nextStep } from '@/engine/pathway';
import { budgetCheck } from '@/engine/budgets';
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
  if (!profile || !model || !step) return null;

  const business = step.businessId ? model.businesses.find((b) => b.id === step.businessId) : null;
  const to = step.stage.tool === 'setup' ? 'businesses/setup' : `toolbox/${step.stage.tool}?guided=1&business=${step.businessId ?? ''}`;
  const anyActive = model.businesses.some((b) => b.active);
  const checkIns = profile.checkInCount;
  const recent = weekLogs.slice(0, 4).map((w) => w.inquiries).filter((n): n is number => n !== null);
  const earlier = weekLogs.slice(4, 8).map((w) => w.inquiries).filter((n): n is number => n !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return (
    <div className="space-y-4">
      <Card title="Do this next" testId="next-card">
        <p className="text-lg font-semibold" data-testid="next-title">
          {step.stage.title}
          {business ? ` for ${business.name}` : ''}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{step.stage.question}</p>
        <div className="mt-3">
          <Button to={to} testId="next-go">
            {anyActive || step.stage.tool === 'setup' ? `Start (about ${step.stage.minutes} min)` : 'Tick your businesses'}
          </Button>
        </div>
        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-2 rounded-full bg-sky-600" style={{ width: `${Math.round(step.progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500" data-testid="progress">
            Pathway: {step.done} of {step.total} steps done.
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
              return `${a.toFixed(1)} contacts a week lately, ${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} on the four weeks before.`;
            })()}
          </p>
        )}
      </Card>
    </div>
  );
}
