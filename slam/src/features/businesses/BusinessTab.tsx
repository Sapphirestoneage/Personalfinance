/* One business tab, layered: this month first, then the numbers that
   matter, then what she sells (each offer folded to one line), where
   contacts come from, more detail, the levers, and in Pro mode the math. */
import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { BUSINESS_FIELDS, BUSINESS_NAMES, OFFER_FIELDS, OFFER_NAMES, OFFER_TYPES_BY_BUSINESS, type FieldMeta } from '@/content/fields';
import type { Offer } from '@/data/schemas';
import { computeBusinessMonth } from '@/engine/businesses';
import { sensitivity, leverBasisWord } from '@/engine/sensitivity';
import { explainMonth } from '@/engine/explain';
import { businessToModel } from '@/data/model';
import { BarList } from '../shared/BarList';
import { Basis, Big, Button, Card, Disclosure, Note, Toggle } from '../shared/ui';
import { NumberField } from '../shared/NumberField';
import { useLabelMode, useSellableHours } from '../shared/hooks';
import { count, money, percent } from '../shared/format';
import { SourcesEditor } from './SourcesEditor';

function offerSummary(o: Offer): string {
  const bits: string[] = [];
  const price = o.priceCents.value;
  if (price !== null) bits.push(money(price, { whole: true }) + (o.type === 'retainer' || o.type === 'subscription' || o.type === 'tribute' ? ' a month' : ''));
  const kept = price !== null && o.feeRate.value !== null ? price * (1 - o.feeRate.value) - (o.variableCostCents.value ?? 0) : null;
  if (kept !== null && o.type !== 'retainer') bits.push(`${money(kept, { whole: true })} kept`);
  if (o.allInHours.value) bits.push(`${count(o.allInHours.value)}h all in`);
  if (o.takeRate?.value !== null && o.takeRate?.value !== undefined) bits.push(`${percent(o.takeRate.value)} take it`);
  if (o.monthsRetained?.value) bits.push(`${count(o.monthsRetained.value, 0)} months`);
  return bits.join(' · ') || 'not set';
}

export function BusinessTab({ id }: { id: string }) {
  const business = useAppStore((s) => s.businesses.find((b) => b.id === id));
  const offers = useAppStore((s) => s.offers);
  const sources = useAppStore((s) => s.sources);
  const setInput = useAppStore((s) => s.setInput);
  const setOfferValue = useAppStore((s) => s.setOfferValue);
  const setOfferActive = useAppStore((s) => s.setOfferActive);
  const setActive = useAppStore((s) => s.setBusinessActive);
  const mode = useLabelMode();
  const sellable = useSellableHours();
  const model = useMemo(() => (business ? businessToModel(business, offers, sources) : null), [business, offers, sources]);
  const month = useMemo(() => (model ? computeBusinessMonth(model.type, model.inputs, model.offers, { sellableHours: sellable }) : null), [model, sellable]);
  const levers = useMemo(() => (model ? sensitivity(model, sellable).slice(0, 5) : []), [model, sellable]);
  if (!business || !model) return <p className="p-4 text-sm">No such business.</p>;
  const mine = offers.filter((o) => o.businessId === id);
  const arcOn = mine.some((o) => o.type === 'arc' && o.active);
  const pro = mode === 'pro';
  const fields = BUSINESS_FIELDS[business.type];
  const core = fields.filter((f) => f.tier !== 'more' || pro);
  const detail = pro ? [] : fields.filter((f) => f.tier === 'more');
  const yoursCount = Object.values(business.inputs).filter((a) => a.label === 'Yours').length;
  const field = (f: FieldMeta) => <NumberField key={f.key} id={`in-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} min={f.min} max={f.max} assumption={business.inputs[f.key]} onCommit={(v) => void setInput(id, f.key, v)} />;
  const mainType = business.type === 'inPerson' ? (arcOn ? 'arc' : 'single') : OFFER_TYPES_BY_BUSINESS[business.type][0];

  return (
    <div className="space-y-4">
      <Card title={`${business.active ? `#${business.priority} ` : ''}${BUSINESS_NAMES[business.type][mode]}`} testId="biz-tab">
        {!business.active && (
          <div className="mb-3 space-y-2">
            <Note tone="warn">Not counted in any total.</Note>
            <Button kind="secondary" onClick={() => void setActive(id, true)} testId="tab-add">
              Add to my businesses
            </Button>
          </div>
        )}
        {month && month.ok ? (
          <>
            <p className="mb-2 text-xs text-slate-500">A month, from the numbers below.</p>
            <div className="grid grid-cols-2 gap-4">
              <Big label="Gross profit" value={money(month.value.grossProfitCents, { whole: true })} testId="tab-gp" />
              <Big label="Hours" value={count(month.value.hoursUsed, 0)} />
              {Object.entries(month.value.volumes)
                .filter(([k]) => ['sessions', 'newClients', 'subscribers', 'paidCalls', 'activeRegulars'].includes(k))
                .slice(0, 2)
                .map(([k, v]) => (
                  <Big key={k} label={{ sessions: 'Sessions', newClients: 'New clients', subscribers: 'Subscribers', paidCalls: 'Paid calls', activeRegulars: 'Regulars' }[k] ?? k} value={count(v)} />
                ))}
            </div>
            {month.value.cap && month.value.cap.cappedBy !== 'none' && (
              <div className="mt-3">
                <Note tone="warn">At capacity ({month.value.cap.cappedBy === 'hours' ? 'your hours' : 'your session cap'}). More contacts would not become more money; price and offers would.</Note>
              </div>
            )}
            <Basis basedOn={month.basedOn} />
          </>
        ) : (
          <Note tone="warn" testId="tab-incomplete">
            Missing: {month && !month.ok ? month.missing.join(', ') : ''}. Fill those in below.
          </Note>
        )}
      </Card>

      <Card title="The numbers that matter" testId="tab-inputs" action={<span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{yoursCount} of {fields.length} yours</span>}>
        <div className="space-y-4">{core.map(field)}</div>
      </Card>

      <Card title="What you sell" testId="tab-offers">
        {business.type === 'inPerson' && <p className="mb-3 text-xs text-slate-500">{arcOn ? 'With the program on, it is the main offer: contacts are consultations, and the single, add-on and retainer do not count.' : 'The single session is the main offer. Switch the program on to model a consult-based offer instead.'}</p>}
        <div className="space-y-2">
          {OFFER_TYPES_BY_BUSINESS[business.type].map((type) => {
            const o = mine.find((x) => x.type === type);
            if (!o) return null;
            const offerFields = OFFER_FIELDS[type].filter((f) => f.tier !== 'more' || pro);
            const offerDetail = pro ? [] : OFFER_FIELDS[type].filter((f) => f.tier === 'more');
            return (
              <Disclosure key={o.id} label={`${OFFER_NAMES[type][mode]}${o.active ? '' : ' (off)'}`} open={type === mainType} testId={`offer-fold-${type}`} count={undefined}>
                <p className="mb-3 text-xs text-slate-500">{offerSummary(o)}</p>
                <Toggle on={o.active} onChange={(v) => void setOfferActive(o.id, v)} label={o.active ? 'On: counted in this business' : 'Off: not counted'} testId={`offer-${type}`} />
                {o.active && (
                  <div className="mt-3 space-y-3">
                    {offerFields.map((f) => (
                      <NumberField key={f.key} id={`of-${type}-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} assumption={o[f.key as 'priceCents']} onCommit={(v) => void setOfferValue(o.id, f.key, v)} />
                    ))}
                    {offerDetail.length > 0 && (
                      <Disclosure label="More detail" testId={`offer-more-${type}`}>
                        <div className="space-y-3">
                          {offerDetail.map((f) => (
                            <NumberField key={f.key} id={`of-${type}-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} assumption={o[f.key as 'priceCents']} onCommit={(v) => void setOfferValue(o.id, f.key, v)} />
                          ))}
                        </div>
                      </Disclosure>
                    )}
                  </div>
                )}
              </Disclosure>
            );
          })}
        </div>
      </Card>

      {business.type !== 'calls' && (
        <Card title={business.type === 'inPerson' ? 'Where contacts come from' : 'Your platforms'} testId="tab-sources">
          <SourcesEditor business={business} />
        </Card>
      )}

      {detail.length > 0 && (
        <Card testId="tab-more">
          <Disclosure label="More detail" testId="more-detail" count={detail.length}>
            <div className="space-y-4">{detail.map(field)}</div>
          </Disclosure>
        </Card>
      )}

      {levers.length > 0 && (
        <Card title="What moves it most" testId="tab-levers">
          <BarList rows={levers.map((l, i) => ({ label: `${l.label} ${l.move}`, value: l.deltaCents, emphasis: i === 0 }))} format={(v) => money(v, { sign: true, whole: true })} summary={`${levers[0]!.label} ${levers[0]!.move} is the biggest single move: ${money(levers[0]!.deltaCents, { sign: true, whole: true })} on ${leverBasisWord(business.type)}.${business.type === 'inPerson' ? ' Screening is not on this list on purpose.' : ''}`} />
        </Card>
      )}

      {pro && month && month.ok && (
        <Card testId="tab-math">
          <Disclosure label="The math" open testId="the-math">
            <ol className="space-y-2 text-sm">
              {explainMonth(model, month.value).map((l) => (
                <li key={l.formula + l.text} className="flex gap-2">
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{l.formula}</span>
                  <span className="tabular-nums">{l.text}</span>
                </li>
              ))}
            </ol>
          </Disclosure>
        </Card>
      )}
    </div>
  );
}
