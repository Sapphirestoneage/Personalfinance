/* One level, run to a card. Fields levels ask one number per screen, with
   a "Confirm" for an estimate that is right as it stands; the run ends in
   the unlock card: how the month moved and which readings became hers. */
import { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/data/store';
import { BANDS, PLANETS, type FieldRef, type Level } from '@/content/levels';
import { BUSINESS_FIELDS, OFFER_FIELDS, SHARED_FIELDS } from '@/content/fields';
import { helpFor } from '@/content/help';
import { typicalFor } from '@/content/samples';
import { STAGE_BY_TOOL, STAGES } from '@/content/stages';
import { aggregateMonth } from '@/engine/aggregate';
import { profileToModel } from '@/data/model';
import { funnelFromLog, LOG_MIN_CONTACTS } from '@/engine/reality';
import { href, navigate } from '@/app/router';
import { Button, Card, Note } from '../shared/ui';
import { NumberField } from '../shared/NumberField';
import { useLabelMode, useModel } from '../shared/hooks';
import { money, percent } from '../shared/format';
import { SourcesEditor } from '../businesses/SourcesEditor';
import { useLevels } from './useLevels';

function metaFor(ref: FieldRef, type: string) {
  const list = ref.where === 'inputs' ? BUSINESS_FIELDS[type as keyof typeof BUSINESS_FIELDS] : ref.where === 'shared' ? SHARED_FIELDS : OFFER_FIELDS[ref.where];
  return list.find((f) => f.key === ref.key);
}

export function LevelRun({ levelId, businessId }: { levelId: string; businessId: string | null }) {
  const model = useModel();
  const mode = useLabelMode();
  const offers = useAppStore((s) => s.offers);
  const businesses = useAppStore((s) => s.businesses);
  const profile = useAppStore((s) => s.profile);
  const clients = useAppStore((s) => s.clients);
  const setInput = useAppStore((s) => s.setInput);
  const setOfferValue = useAppStore((s) => s.setOfferValue);
  const setSetting = useAppStore((s) => s.setSetting);
  const { overview, facts } = useLevels(businessId);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const opened = useRef<{ profit: number | null; yours: Set<string> } | null>(null);
  const business = facts?.business ?? null;
  const level: Level | undefined = overview?.levels.find((l) => l.level.id === levelId)?.level;

  if (model && business && overview && opened.current === null) {
    const t = aggregateMonth(model);
    opened.current = { profit: t.ok ? t.value.profitCents : null, yours: new Set(overview.readings.filter((r) => r.status === 'yours').map((r) => r.reading.id)) };
  }
  const q = business ? `?business=${business.id}` : '';
  const nextAfter = useMemo(() => overview?.next.find((l) => l.level.id !== levelId) ?? null, [overview, levelId]);

  if (!model || !business || !overview || !level || !profile) {
    return (
      <Card title="Level">
        <p className="text-sm">No such level for this business.</p>
        <div className="mt-3">
          <Button to="levels" kind="secondary">
            Back to levels
          </Button>
        </div>
      </Card>
    );
  }
  const planet = PLANETS.find((p) => p.id === level.planet)!;
  const band = BANDS.find((b) => b.band === level.band)!;
  const row = businesses.find((b) => b.id === business.id)!;

  const header = (
    <Card testId="level-head">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Round {level.band} · {band.name} · {planet.name}
      </p>
      <p className="mt-1 text-lg font-semibold">{level.title}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{level.question}</p>
    </Card>
  );

  const unlock = () => {
    const st = useAppStore.getState();
    const after = st.profile ? aggregateMonth(profileToModel(st.profile, st.businesses, st.offers, st.sources)) : null;
    const afterProfit = after && after.ok ? after.value.profitCents : null;
    const before = opened.current?.profit ?? null;
    const newlyYours = overview.readings.filter((r) => r.status === 'yours' && !opened.current?.yours.has(r.reading.id));
    const roundNow = overview.rounds.find((r) => r.band === level.band);
    return (
      <Card title={band.payoff === 'power' ? 'Power' : band.payoff === 'certainty' ? 'Firmer' : 'Revealed'} testId="unlock">
        {before !== null && afterProfit !== null && Math.round(before) !== Math.round(afterProfit) ? (
          <p className="text-sm" data-testid="unlock-moved">
            Built on your numbers now: <strong>{money(afterProfit, { whole: true })}</strong> profit a month. The estimates had said {money(before, { whole: true })}.
          </p>
        ) : (
          <p className="text-sm">Profit a month: <strong>{afterProfit === null ? 'not yet' : money(afterProfit, { whole: true })}</strong>. Your numbers agree with the estimates so far.</p>
        )}
        {newlyYours.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm" data-testid="unlock-readings">
            {newlyYours.map((r) => (
              <li key={r.reading.id}>
                <span className="mr-2 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">yours now</span>
                <a href={href(r.reading.to)} className="underline">
                  {r.reading.label}
                </a>
              </li>
            ))}
          </ul>
        )}
        {roundNow && <p className="mt-2 text-xs text-slate-500">{roundNow.complete ? `Round ${level.band} complete on every planet.` : `Round ${level.band}: ${roundNow.planetsDone} of ${roundNow.planetsTotal} planets done.`}</p>}
        <div className="mt-4 space-y-2">
          {nextAfter ? (
            <Button to={`levels/${nextAfter.level.id}${q}`} testId="unlock-next">
              Next: {nextAfter.level.title} (about {nextAfter.level.minutes} min)
            </Button>
          ) : (
            <Button to="today">Back to Today</Button>
          )}
          <Button to="levels" kind="secondary">
            All levels
          </Button>
        </div>
      </Card>
    );
  };

  const w = level.what;

  if (w.kind === 'stage') {
    const stage = STAGES.find((s) => s.stage === w.stage)!;
    const done = profile.pathway.completedSteps.includes(`${business.id}:${w.stage}`);
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">This level is the {stage.title} tool, about {stage.minutes} minutes. Finishing it checks this level off.</p>
          <div className="mt-3">
            <Button to={`toolbox/${stage.tool}?guided=1&business=${business.id}`} testId="level-open-tool">
              {done ? 'Run it again' : 'Open the tool'}
            </Button>
          </div>
          {done && <div className="mt-3"><Note tone="good">Done already.</Note></div>}
        </Card>
      </div>
    );
  }

  if (w.kind === 'checkins') {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">{profile.checkInCount >= 4 ? 'Four check-ins are in. My Numbers shows them against the model.' : `${profile.checkInCount} of 4 check-ins saved. The 60-second check-in is on Today; one a week is enough.`}</p>
          <div className="mt-3">
            <Button to={profile.checkInCount >= 4 ? 'numbers' : 'today'} testId="level-open-checkin">
              {profile.checkInCount >= 4 ? 'See them against the model' : 'Go to the check-in'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (w.kind === 'log') {
    const f = funnelFromLog(clients, business.id);
    const used = Object.values(business.inputs).some((a) => a.source === 'from your client log');
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {used ? 'Your rates come from your own log now.' : f.enough ? `${f.contacts} contacts logged in the last 90 days: pass ${f.passRate === null ? '?' : percent(f.passRate)}, booking ${f.bookingRate === null ? '?' : percent(f.bookingRate)}, show ${f.showRate === null ? '?' : percent(f.showRate)}. One tap on the Clients screen replaces the estimates.` : `${f.contacts} of ${LOG_MIN_CONTACTS} contacts logged. Log each contact as an alias on the Clients screen; after ${LOG_MIN_CONTACTS}, one tap replaces the estimates with your real rates.`}
          </p>
          <div className="mt-3">
            <Button to="clients" testId="level-open-clients">
              {used ? 'See the log' : f.enough ? 'Use my rates' : 'Log contacts'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (w.kind === 'sources') {
    return (
      <div className="space-y-4">
        {header}
        {finished ? (
          unlock()
        ) : (
          <Card>
            <SourcesEditor business={row} />
            <div className="mt-3">
              <Button testId="level-finish" disabled={(business.sources?.length ?? 0) === 0} onClick={() => setFinished(true)}>
                Done
              </Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  /* fields: one per screen */
  const refs = w.fields.filter((r) => (r.where === 'inputs' ? business.inputs[r.key] : r.where === 'shared' ? model.shared[r.key] : business.offers[r.where]?.[r.key]) !== undefined);
  const ref = refs[step];
  const assumptionOf = (r: FieldRef) => (r.where === 'inputs' ? business.inputs[r.key] : r.where === 'shared' ? model.shared[r.key] : business.offers[r.where]?.[r.key]);
  const write = async (r: FieldRef, value: number | null, source?: string) => {
    if (r.where === 'inputs') await setInput(business.id, r.key, value, 'Yours', source);
    else if (r.where === 'shared') await setSetting(r.key, value, 'Yours', source);
    else {
      const o = offers.find((x) => x.businessId === business.id && x.type === r.where);
      if (o) await setOfferValue(o.id, r.key, value, 'Yours', source);
    }
  };
  const writeTypical = async (r: FieldRef, value: number) => {
    if (r.where === 'inputs') await setInput(business.id, r.key, value, 'Preset', 'the typical number, chosen by you');
    else if (r.where === 'shared') await setSetting(r.key, value, 'Preset', 'the typical number, chosen by you');
    else {
      const o = offers.find((x) => x.businessId === business.id && x.type === r.where);
      if (o) await setOfferValue(o.id, r.key, value, 'Preset', 'the typical number, chosen by you');
    }
  };
  const advance = () => {
    if (step + 1 >= refs.length) setFinished(true);
    else setStep(step + 1);
  };

  if (finished || !ref) return <div className="space-y-4">{header}{unlock()}</div>;
  const meta = metaFor(ref, business.type);
  const a = assumptionOf(ref);
  const isYours = a?.label === 'Yours';
  return (
    <div className="space-y-4">
      {header}
      <Card testId="level-question">
        <p className="mb-2 text-xs text-slate-500">
          {refs.length > 1 ? `${step + 1} of ${refs.length}. ` : ''}
          {isYours ? 'Already yours; change it or keep it.' : 'Type your number, or confirm the estimate if it is about right.'}
        </p>
        <NumberField id={`lv-${ref.where}-${ref.key}`} label={meta?.labels[mode] ?? ref.key} help={meta?.help} unit={meta?.unit ?? 'count'} min={meta?.min} max={meta?.max} assumption={a} guide={helpFor(ref.where, ref.key)} typical={typicalFor(business.type, ref.where, ref.key)} onUseTypical={(v) => void writeTypical(ref, v)} onCommit={(v) => void write(ref, v)} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {isYours ? (
            <Button kind="secondary" onClick={() => (step === 0 ? navigate(`levels${q}`) : setStep(step - 1))}>
              Back
            </Button>
          ) : (
            <Button kind="secondary" testId="level-confirm" disabled={a?.value === null || a?.value === undefined} onClick={() => void write(ref, a?.value ?? null, 'confirmed by you').then(advance)}>
              Confirm the estimate
            </Button>
          )}
          <Button testId="level-next" onClick={advance}>
            {step + 1 >= refs.length ? 'See what it unlocks' : 'Next'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
