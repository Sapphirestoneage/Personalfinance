/* Hypotheticals: Normal, Dream and Disaster side by side, each business's
   share, switchable events, editable multipliers (per scenario and per
   business), and runway in Disaster. */
import { useMemo, useState } from 'react';
import { useAppStore } from '@/data/store';
import type { EventId, ScenarioKind } from '@/data/schemas';
import { compareScenarios, DISASTER_EVENTS, DREAM_EVENTS, type ScenarioSpec } from '@/engine/scenarios';
import { Bars } from '../shared/Bars';
import { Big, Card, Note, Toggle } from '../shared/ui';
import { useModel } from '../shared/hooks';
import { count, money } from '../shared/format';

const EVENT_WORDS: Record<EventId, string> = {
  platform_ban: 'A platform bans you',
  house_stops: 'The house stops sending clients',
  top_regular_leaves: 'Your top regular leaves',
  month_off_sick: 'A month off sick',
  processor_hold: 'The processor holds funds 30 days',
  price_war: 'A price war (prices -15%)',
  viral_post: 'A post goes viral',
  press_feature: 'A press feature',
  waitlist: 'A waitlist fills every slot',
  regular_upgrades_to_retainer: 'A regular upgrades to a retainer',
};

function PctField({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId: string }) {
  const [text, setText] = useState(String(Math.round((value - 1) * 100)));
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          data-testid={testId}
          type="number"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Number(text);
            if (Number.isFinite(n)) onChange(1 + n / 100);
            else setText(String(Math.round((value - 1) * 100)));
          }}
          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-900"
        />
        <span>%</span>
      </span>
    </label>
  );
}

export function Hypotheticals() {
  const model = useModel();
  const scenarios = useAppStore((s) => s.scenarios);
  const setScenario = useAppStore((s) => s.setScenario);
  const setOverride = useAppStore((s) => s.setBusinessOverride);
  const profile = useAppStore((s) => s.profile);
  const [editing, setEditing] = useState<ScenarioKind>('Disaster');
  const [overrideBiz, setOverrideBiz] = useState<string>('');
  const specs: ScenarioSpec[] = useMemo(() => scenarios.map((s) => ({ kind: s.kind, multipliers: s.multipliers, events: s.events })), [scenarios]);
  const compared = useMemo(() => (model && specs.length ? compareScenarios(model, specs) : null), [model, specs]);
  if (!model || !compared || !profile) return null;
  const kinds: ScenarioKind[] = ['Disaster', 'Normal', 'Dream'];
  const profitOf = (k: ScenarioKind) => {
    const r = compared[k];
    return r && r.ok ? r.value.totals.profitCents : null;
  };
  const rows = kinds.map((k) => ({ label: k, value: profitOf(k) ?? 0, emphasis: k === 'Normal' }));
  const disaster = compared.Disaster;
  const editingScenario = scenarios.find((s) => s.kind === editing)!;
  const eventsFor = editing === 'Dream' ? DREAM_EVENTS : editing === 'Disaster' ? DISASTER_EVENTS : [...DISASTER_EVENTS, ...DREAM_EVENTS];
  const active = model.businesses.filter((b) => b.active);
  const ob = active.find((b) => b.id === overrideBiz);
  const override = ob?.scenarioOverrides?.[editing];

  return (
    <div className="space-y-4">
      <Card title="Three futures, side by side" testId="hypo-card">
        <div className="grid grid-cols-3 gap-2 text-center">
          {kinds.map((k) => (
            <div key={k} className={`rounded-xl p-2 ${k === 'Normal' ? 'bg-sky-50 dark:bg-sky-900/30' : 'bg-slate-50 dark:bg-slate-800'}`}>
              <div className="text-xs text-slate-500">{k}</div>
              <div className="text-lg font-semibold tabular-nums" data-testid={`scenario-${k}`}>
                {profitOf(k) === null ? 'not yet' : money(profitOf(k), { whole: true })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Bars rows={rows} format={(v) => money(v, { whole: true })} summary={`Profit a month. Disaster ${profitOf('Disaster') === null ? 'cannot be computed yet' : money(profitOf('Disaster'), { whole: true })}, Dream ${profitOf('Dream') === null ? 'not yet' : money(profitOf('Dream'), { whole: true })}.`} />
        </div>
        {!compared.Normal.ok && <Note tone="warn">Missing: {compared.Normal.missing.join(', ')}.</Note>}
      </Card>

      <Card title="Runway in Disaster" testId="runway-card">
        {disaster.ok && disaster.value.runway ? (
          disaster.value.runway.months === null ? (
            <p className="text-sm">Even in Disaster, profit covers your income goal. No runway needed.</p>
          ) : (
            <>
              <Big label="Months your cash lasts" value={count(disaster.value.runway.months, 1)} testId="runway" tone={disaster.value.runway.months < 3 ? 'warn' : 'plain'} />
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Shortfall {money(disaster.value.runway.shortfallCents, { whole: true })} a month against your goal{disaster.value.heldCashCents > 0 ? `, with ${money(disaster.value.heldCashCents, { whole: true })} held by the processor` : ''}.
              </p>
            </>
          )
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">Runway needs {disaster.ok ? disaster.value.runwayMissing.map((k) => (k.includes('cash') ? 'cash on hand' : 'an income goal')).join(' and ') : 'complete numbers'}. Set it in Shared settings.</p>
        )}
      </Card>

      <Card title="Each business's share" testId="share-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">Business</th>
              {kinds.map((k) => (
                <th key={k} className="py-1 text-right">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((b) => (
              <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">{b.name}</td>
                {kinds.map((k) => {
                  const r = compared[k];
                  const share = r && r.ok ? r.value.totals.businesses.find((x) => x.id === b.id) : null;
                  return (
                    <td key={k} className="py-1 text-right tabular-nums">
                      {share ? `${money(share.month.grossProfitCents, { whole: true })} (${Math.round(share.shareOfGp * 100)}%)` : 'not yet'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Change a future" testId="edit-card">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {kinds.map((k) => (
            <button key={k} type="button" data-testid={`edit-${k}`} onClick={() => setEditing(k)} className={`rounded-xl px-3 py-2 text-sm font-medium ${editing === k ? 'bg-sky-700 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <PctField key={`${editing}-a`} label="Contacts and audience" value={editingScenario.multipliers.audience} testId="mult-audience" onChange={(v) => void setScenario(editing, { ...editingScenario.multipliers, audience: Math.max(0, v) }, editingScenario.events)} />
          <PctField key={`${editing}-c`} label="Conversion" value={editingScenario.multipliers.conversion} testId="mult-conversion" onChange={(v) => void setScenario(editing, { ...editingScenario.multipliers, conversion: Math.max(0, v) }, editingScenario.events)} />
        </div>
        <p className="mt-3 mb-2 text-xs uppercase tracking-wide text-slate-500">Events</p>
        <div className="space-y-2">
          {eventsFor.map((e) => (
            <Toggle
              key={e}
              label={EVENT_WORDS[e]}
              testId={`event-${e}`}
              on={editingScenario.events.includes(e)}
              onChange={(on) => void setScenario(editing, editingScenario.multipliers, on ? [...editingScenario.events, e] : editingScenario.events.filter((x) => x !== e))}
            />
          ))}
        </div>
        <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-slate-500">One business differently</p>
        <select data-testid="override-biz" value={overrideBiz} onChange={(e) => setOverrideBiz(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <option value="">Same as the scenario</option>
          {active.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {ob && (
          <div className="mt-2 space-y-2">
            <PctField key={`${ob.id}-${editing}-a`} label={`${ob.name}: contacts and audience`} value={override?.multipliers?.audience ?? editingScenario.multipliers.audience} testId="ov-audience" onChange={(v) => void setOverride(ob.id, editing, { ...override, multipliers: { ...override?.multipliers, audience: Math.max(0, v) } })} />
            <PctField key={`${ob.id}-${editing}-c`} label={`${ob.name}: conversion`} value={override?.multipliers?.conversion ?? editingScenario.multipliers.conversion} testId="ov-conversion" onChange={(v) => void setOverride(ob.id, editing, { ...override, multipliers: { ...override?.multipliers, conversion: Math.max(0, v) } })} />
            {override && (
              <button type="button" data-testid="ov-clear" onClick={() => void setOverride(ob.id, editing, undefined)} className="text-sm text-slate-500 underline">
                Back to the scenario's numbers
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
