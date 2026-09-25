/* One shell for every tool. Guided: one question per screen, known values
   prefilled, then the answer. Standalone: every field on one screen with
   the sandbox on; nothing is written until "Save to my business". Either
   way, finishing checks off the matching pathway step. */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore, type ValuePatch } from '@/data/store';
import type { Assumption, OfferType } from '@/data/schemas';
import { STAGE_BY_TOOL, type ToolId } from '@/content/stages';
import { navigate } from '@/app/router';
import { Button, Card, Note, Toggle } from '../shared/ui';
import { NumberField } from '../shared/NumberField';
import { useLabelMode, useModel, useSellableHours } from '../shared/hooks';
import { TOOLS, type ToolCtx, type ToolField, type Values } from './tools';

function initial(field: ToolField, ctx: ToolCtx): Assumption {
  const [where, key] = field.key.split('.') as [string, string];
  let found: Assumption | undefined;
  if (where === 'inputs') found = ctx.business.inputs[key];
  else if (where === 'shared') found = ctx.shared[key];
  else if (where !== 'tool') found = ctx.business.offers[where as OfferType]?.[key];
  if (found) return { ...found, key };
  return { key, value: field.fallback ?? null, label: field.fallback === null || field.fallback === undefined ? 'Placeholder' : 'Preset', source: 'tool default', updated: new Date().toISOString() };
}

function toPatch(values: Values, ctx: ToolCtx): ValuePatch {
  const patch: ValuePatch = { inputs: {}, offers: {}, shared: {} };
  for (const [k, a] of Object.entries(values)) {
    const [where, key] = k.split('.') as [string, string];
    if (where === 'tool') continue;
    if (a.label !== 'Yours') continue;
    if (where === 'inputs') patch.inputs![key] = a.value;
    else if (where === 'shared') patch.shared![key] = a.value;
    else {
      if (!ctx.business.offers[where as OfferType]) continue;
      (patch.offers![where as OfferType] ??= {})[key] = a.value;
    }
  }
  return patch;
}

export function ToolShell({ tool, businessId, guided }: { tool: Exclude<ToolId, 'setup'>; businessId: string | null; guided: boolean }) {
  const def = TOOLS[tool];
  const stage = STAGE_BY_TOOL[tool];
  const model = useModel();
  const mode = useLabelMode();
  const sellableHours = useSellableHours();
  const applyValues = useAppStore((s) => s.applyValues);
  const completeStep = useAppStore((s) => s.completeStep);
  const [sandbox, setSandbox] = useState(!guided);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(true);

  const business = useMemo(() => {
    if (!model) return null;
    const active = model.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority);
    return model.businesses.find((b) => b.id === businessId) ?? active[0] ?? null;
  }, [model, businessId]);
  const ctx: ToolCtx | null = useMemo(() => (model && business ? { business, shared: model.shared, mode, sellableHours } : null), [model, business, mode, sellableHours]);
  const fields = useMemo(() => (ctx ? def.fields(ctx) : []), [ctx, def]);

  useEffect(() => {
    if (!ctx || !pending) return;
    const init: Values = {};
    for (const f of fields) init[f.key] = initial(f, ctx);
    setValues(init);
    setPending(false);
  }, [ctx, fields, pending]);

  if (!model || !business || !ctx) {
    return (
      <Card title={stage.title}>
        <Note tone="warn">Tick a business first; every tool works on one business at a time.</Note>
        <div className="mt-3">
          <Button to="businesses/setup">Go to Setup</Button>
        </div>
      </Card>
    );
  }

  const derived = def.derive ? def.derive(values, ctx) : values;
  const result = def.compute(derived, ctx);
  const commit = (f: ToolField, v: number | null) => {
    const next: Values = { ...values, [f.key]: { key: f.key.split('.')[1]!, value: v, label: 'Yours', source: 'typed by you', updated: new Date().toISOString() } };
    setValues(next);
    setSaved(false);
    if (!sandbox && def.saves) void applyValues(business.id, toPatch(def.derive ? def.derive(next, ctx) : next, ctx));
  };
  const finish = async () => {
    if (def.saves && sandbox) await applyValues(business.id, toPatch(derived, ctx));
    await completeStep(business.id, stage.stage);
    setSaved(true);
  };

  const resultCard = (
    <Card title={result.ok ? 'What this says' : 'Not yet'} testId="tool-result">
      {result.lines.length > 0 && (
        <dl className="space-y-2">
          {result.lines.map((l) => {
            const long = l.value.length > 28;
            return (
              <div key={l.label} className={`text-sm ${long ? '' : 'flex items-baseline justify-between gap-3'}`}>
                <dt className="text-slate-600 dark:text-slate-300">{l.label}</dt>
                <dd className={`font-semibold ${long ? 'mt-0.5' : 'text-right'} ${l.tone === 'good' ? 'text-green-700 dark:text-green-300' : l.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : ''}`}>{l.value}</dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="mt-3 text-sm" data-testid="tool-summary">
        {result.summary}
      </p>
      {result.credit && <p className="mt-2 text-xs text-slate-500">{result.credit}</p>}
      {result.ok && (
        <div className="mt-4 space-y-2">
          {!saved ? (
            <Button testId="tool-finish" onClick={() => void finish()}>
              {def.saves && sandbox ? 'Save to my business' : 'Done'}
            </Button>
          ) : (
            <>
              <Note tone="good" testId="tool-saved">
                {def.saves && sandbox ? 'Saved to your business and ' : ''}checked off on your pathway.
              </Note>
              <Button kind="secondary" to="today">
                Back to Today
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );

  if (guided) {
    const f = fields[step];
    const last = step >= fields.length;
    return (
      <div className="space-y-4">
        <Card title={`${stage.title}: ${business.name}`} testId="tool-guided">
          <p className="text-sm text-slate-600 dark:text-slate-300">{stage.question}</p>
          <p className="mt-2 text-xs text-slate-500">
            {last ? 'The answer' : `Question ${step + 1} of ${fields.length}`}
          </p>
        </Card>
        {!last && f && (
          <Card testId="tool-question">
            {f.section && <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">{f.section}</p>}
            <NumberField key={f.key} id={`q-${f.key.replace('.', '-')}`} label={f.label} help={f.help} unit={f.unit} min={f.min} max={f.max} plain={f.key.startsWith('tool.')} assumption={values[f.key]} onCommit={(v) => commit(f, v)} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button kind="secondary" onClick={() => (step === 0 ? navigate('today') : setStep(step - 1))}>
                Back
              </Button>
              <Button testId="tool-next" onClick={() => setStep(step + 1)}>
                {step + 1 === fields.length ? 'See the answer' : values[f.key]?.label === 'Yours' ? 'Next' : 'Keep the estimate'}
              </Button>
            </div>
          </Card>
        )}
        {last && resultCard}
        {last && (
          <Button kind="quiet" onClick={() => setStep(0)}>
            Change an answer
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title={`${stage.title}: ${business.name}`} testId="tool-standalone">
        <p className="text-sm text-slate-600 dark:text-slate-300">{stage.question}</p>
        {def.saves && (
          <div className="mt-3">
            <Toggle on={sandbox} onChange={setSandbox} label={sandbox ? 'Sandbox: nothing saved until you say so' : 'Live: changes go straight to your business'} testId="sandbox" />
          </div>
        )}
      </Card>
      <Card testId="tool-fields">
        <div className="space-y-4">
          {fields.map((f, i) => (
            <div key={f.key}>
              {f.section && fields[i - 1]?.section !== f.section && <h3 className={`mb-3 text-sm font-semibold ${i > 0 ? 'mt-2 border-t border-slate-100 pt-4 dark:border-slate-800' : ''}`}>{f.section}</h3>}
              <NumberField id={`q-${f.key.replace('.', '-')}`} label={f.label} help={f.help} unit={f.unit} min={f.min} max={f.max} plain={f.key.startsWith('tool.')} assumption={values[f.key]} onCommit={(v) => commit(f, v)} />
            </div>
          ))}
        </div>
      </Card>
      {resultCard}
    </div>
  );
}
