/* ==========================================================================
   The phase 0 screen: proves the foundation on a phone. One editable
   number (contacts last month), this month's numbers from the engine with
   their label, the three scenarios side by side, and backup in and out.
   Phase 1 replaces this with the side menu and the real screens.
   ========================================================================== */
import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/data/store';
import { EXPORT_REMINDER, exportFileName } from '@/data/transfer';
import { aggregateMonth, compareScenarios, type ScenarioSpec } from '@/engine';
import { NON_AFFILIATION, NO_ADVICE, ON_DEVICE } from '@/content/credits';
import { NumberField } from '../shared/NumberField';
import { count, money } from '../shared/format';

function Card({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Big({ label, value, testId, tone = 'plain' }: { label: string; value: string; testId?: string; tone?: 'plain' | 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-green-700 dark:text-green-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : '';
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div data-testid={testId} className={`text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

export function Phase0Screen() {
  const profile = useAppStore((s) => s.profile);
  const businesses = useAppStore((s) => s.businesses);
  const offers = useAppStore((s) => s.offers);
  const scenarios = useAppStore((s) => s.scenarios);
  const seeded = useAppStore((s) => s.seeded);
  const setInput = useAppStore((s) => s.setInput);
  const exportBackup = useAppStore((s) => s.exportBackup);
  const importBackup = useAppStore((s) => s.importBackup);
  const resetToDemo = useAppStore((s) => s.resetToDemo);
  const model = useAppStore((s) => s.model);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const m = useMemo(() => model(), [model, profile, businesses, offers]);
  const first = businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0];
  const totals = useMemo(() => (m ? aggregateMonth(m) : null), [m]);
  const specs: ScenarioSpec[] = useMemo(() => scenarios.map((s) => ({ kind: s.kind, multipliers: s.multipliers, events: s.events })), [scenarios]);
  const compared = useMemo(() => (m && specs.length ? compareScenarios(m, specs) : null), [m, specs]);

  const onExport = async () => {
    const text = await exportBackup();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote(EXPORT_REMINDER);
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importBackup(await file.text());
      setNote('Restored from your file. Everything on this device now matches it.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That file could not be restored.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!profile || !first) return <p className="p-4">No profile yet.</p>;
  const inquiries = first.inputs.inquiriesPerMonth;
  const yoursCount = Object.values(first.inputs).filter((a) => a.label === 'Yours').length;
  const totalCount = Object.values(first.inputs).length;

  return (
    <div className="space-y-4">
      <Card title="Where things stand" testId="status-card">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Phase 0 is in: the engine, the numbers with their labels, and backup. {seeded === 'demo' ? 'This device is showing the sample profile.' : seeded === 'import' ? 'This device was restored from a file.' : 'This device is showing what it saved before.'}
        </p>
        <p className="mt-2 text-xs text-slate-500">{ON_DEVICE}</p>
      </Card>

      <Card title={`Your #1: ${first.name}`} testId="first-business">
        <NumberField
          id="inquiries"
          label="Contacts last month"
          assumption={inquiries}
          unit="count"
          onCommit={(v) => void setInput(first.id, 'inquiriesPerMonth', v)}
        />
        <p className="mt-3 text-xs text-slate-500" data-testid="yours-count">
          {yoursCount} of {totalCount} numbers here are yours; the rest are labeled estimates.
        </p>
      </Card>

      <Card title="This month, from those numbers" testId="month-card">
        {totals && totals.ok ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Big label="Gross profit" value={money(totals.value.grossProfitCents, { whole: true })} testId="gross-profit" />
              <Big label="Profit after fixed costs" value={money(totals.value.profitCents, { whole: true })} testId="profit" tone={totals.value.profitCents >= 0 ? 'good' : 'warn'} />
              <Big label="Sessions" value={count(totals.value.businesses[0]?.month.volumes.sessions ?? null)} testId="sessions" />
              <Big label="Businesses counted" value={String(totals.value.businesses.length)} />
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" data-testid="basis">
              {totals.basedOn.allYours ? 'All of this comes from your own numbers.' : `This is an estimate: the weakest input is ${totals.basedOn.weakest.toLowerCase() === 'yours' ? 'yours' : 'a ' + totals.basedOn.weakest.toLowerCase()}.`}
            </p>
            {totals.value.businesses[0]?.month.cap?.cappedBy !== 'none' && (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Demand is above capacity: the sessions shown are the most the month allows.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="incomplete">
            Not enough to compute yet. Missing: {totals && !totals.ok ? totals.missing.join(', ') : 'profile'}.
          </p>
        )}
      </Card>

      {compared && (
        <Card title="Three futures, side by side" testId="scenarios-card">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(['Disaster', 'Normal', 'Dream'] as const).map((kind) => {
              const r = compared[kind];
              return (
                <div key={kind} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
                  <div className="text-xs text-slate-500">{kind}</div>
                  <div className="text-lg font-semibold tabular-nums" data-testid={`scenario-${kind}`}>
                    {r && r.ok ? money(r.value.totals.profitCents, { whole: true }) : 'not yet'}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Profit a month. Dream: 30% more contacts, 20% better conversion. Disaster: 40% fewer contacts, 25% worse conversion.</p>
        </Card>
      )}

      <Card title="Backup" testId="backup-card">
        <div className="grid grid-cols-1 gap-2">
          <button type="button" data-testid="export" onClick={() => void onExport()} className="rounded-xl bg-sky-700 px-4 py-3 font-medium text-white">
            Save a backup file
          </button>
          <button type="button" data-testid="import" onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-300 px-4 py-3 font-medium dark:border-slate-700">
            Restore from a file
          </button>
          <input ref={fileRef} data-testid="import-file" type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImportFile(e.target.files?.[0])} />
          <button
            type="button"
            data-testid="reset"
            onClick={() => {
              if (window.confirm('Replace everything on this device with the sample profile?')) void resetToDemo();
            }}
            className="rounded-xl px-4 py-3 text-sm text-slate-500"
          >
            Start over with the sample
          </button>
        </div>
        {note && (
          <p data-testid="note" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            {note}
          </p>
        )}
      </Card>

      <footer className="space-y-2 px-1 pb-8 text-xs text-slate-500">
        <p>{NO_ADVICE}</p>
        <p>{NON_AFFILIATION}</p>
      </footer>
    </div>
  );
}
