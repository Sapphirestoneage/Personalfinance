/* One business tab: this month from its numbers, its inputs, its offers,
   and its levers. Everything here is this business's own. */
import { useMemo } from 'react';
import { useAppStore } from '@/data/store';
import { BUSINESS_FIELDS, BUSINESS_NAMES, OFFER_FIELDS, OFFER_NAMES, OFFER_TYPES_BY_BUSINESS } from '@/content/fields';
import { computeBusinessMonth } from '@/engine/businesses';
import { sensitivity } from '@/engine/sensitivity';
import { businessToModel } from '@/data/model';
import { Bars } from '../shared/Bars';
import { Basis, Big, Button, Card, Note, Toggle } from '../shared/ui';
import { NumberField } from '../shared/NumberField';
import { useLabelMode, useSellableHours } from '../shared/hooks';
import { count, money } from '../shared/format';

export function BusinessTab({ id }: { id: string }) {
  const business = useAppStore((s) => s.businesses.find((b) => b.id === id));
  const offers = useAppStore((s) => s.offers);
  const setInput = useAppStore((s) => s.setInput);
  const setOfferValue = useAppStore((s) => s.setOfferValue);
  const setOfferActive = useAppStore((s) => s.setOfferActive);
  const setActive = useAppStore((s) => s.setBusinessActive);
  const mode = useLabelMode();
  const sellable = useSellableHours();
  const model = useMemo(() => (business ? businessToModel(business, offers) : null), [business, offers]);
  const month = useMemo(() => (model ? computeBusinessMonth(model.type, model.inputs, model.offers, { sellableHours: sellable }) : null), [model, sellable]);
  const levers = useMemo(() => (model ? sensitivity(model, sellable).slice(0, 5) : []), [model, sellable]);
  if (!business || !model) return <p className="p-4 text-sm">No such business.</p>;
  const mine = offers.filter((o) => o.businessId === id);
  const arcOn = mine.some((o) => o.type === 'arc' && o.active);

  return (
    <div className="space-y-4">
      <Card title={`${business.active ? `#${business.priority} ` : ''}${BUSINESS_NAMES[business.type][mode]}`} testId="biz-tab">
        {!business.active && (
          <div className="mb-3">
            <Note tone="warn">Not counted in any total. </Note>
            <div className="mt-2">
              <Button kind="secondary" onClick={() => void setActive(id, true)} testId="tab-add">
                Add to my businesses
              </Button>
            </div>
          </div>
        )}
        {month && month.ok ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Big label="Gross profit a month" value={money(month.value.grossProfitCents, { whole: true })} testId="tab-gp" />
              <Big label="Hours a month" value={count(month.value.hoursUsed, 0)} />
              {Object.entries(month.value.volumes)
                .filter(([k]) => ['sessions', 'newClients', 'subscribers', 'paidCalls', 'activeRegulars'].includes(k))
                .map(([k, v]) => (
                  <Big key={k} label={{ sessions: 'Sessions', newClients: 'New clients', subscribers: 'Subscribers', paidCalls: 'Paid calls', activeRegulars: 'Regulars' }[k] ?? k} value={count(v)} />
                ))}
            </div>
            {month.value.cap && month.value.cap.cappedBy !== 'none' && <div className="mt-2"><Note tone="warn">At capacity ({month.value.cap.cappedBy === 'hours' ? 'your hours' : 'your session cap'}). More contacts would not become more money.</Note></div>}
            <Basis basedOn={month.basedOn} />
          </>
        ) : (
          <Note tone="warn" testId="tab-incomplete">Missing: {month && !month.ok ? month.missing.join(', ') : ''}. Fill those in below.</Note>
        )}
      </Card>

      <Card title="Your numbers" testId="tab-inputs">
        <div className="space-y-4">
          {BUSINESS_FIELDS[business.type].map((f) => (
            <NumberField key={f.key} id={`in-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} min={f.min} max={f.max} assumption={business.inputs[f.key]} onCommit={(v) => void setInput(id, f.key, v)} />
          ))}
        </div>
      </Card>

      <Card title="What you sell" testId="tab-offers">
        {business.type === 'inPerson' && <p className="mb-3 text-xs text-slate-500">{arcOn ? 'With the program on, it is the main offer: contacts are consultations, and the single, add-on and retainer are not counted.' : 'The single session is the main offer. Switch the program on to model a consult-based offer instead.'}</p>}
        <div className="space-y-4">
          {OFFER_TYPES_BY_BUSINESS[business.type].map((type) => {
            const o = mine.find((x) => x.type === type);
            if (!o) return null;
            return (
              <div key={o.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <Toggle on={o.active} onChange={(v) => void setOfferActive(o.id, v)} label={OFFER_NAMES[type][mode]} testId={`offer-${type}`} />
                {o.active && (
                  <div className="mt-3 space-y-3">
                    {OFFER_FIELDS[type].map((f) => (
                      <NumberField key={f.key} id={`of-${type}-${f.key}`} label={f.labels[mode]} help={f.help} unit={f.unit} assumption={o[f.key as 'priceCents']} onCommit={(v) => void setOfferValue(o.id, f.key, v)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {levers.length > 0 && (
        <Card title="What moves it most" testId="tab-levers">
          <Bars rows={levers.map((l) => ({ label: `${l.label} ${l.move}`, value: l.deltaCents }))} format={(v) => money(v, { sign: true, whole: true })} summary={`${levers[0]!.label} ${levers[0]!.move} is the biggest single move: ${money(levers[0]!.deltaCents, { sign: true, whole: true })} a month.`} />
        </Card>
      )}
    </div>
  );
}
