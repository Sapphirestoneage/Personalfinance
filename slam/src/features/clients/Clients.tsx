/* Clients: the inquiry log and CRM. Aliases only, ever. Screening keeps a
   result, never a reason or a document. Regulars carry an agreed budget. */
import { useMemo, useState } from 'react';
import { useAppStore } from '@/data/store';
import { CLIENT_STAGES, DEPOSIT_STATUSES, LOST_REASONS, SCREENING_RESULTS, type ClientRecord, type Sale } from '@/data/schemas';
import { budgetCheck } from '@/engine/budgets';
import { funnelFromLog, LOG_MIN_CONTACTS } from '@/engine/reality';
import { percent } from '../shared/format';
import { Button, Card, ConfirmButton, Empty, Note } from '../shared/ui';
import { useLabelMode, newId } from '../shared/hooks';
import { money, count } from '../shared/format';

const STAGE_WORDS: Record<ClientRecord['stage'], string> = { inquiry: 'Contacted', screening: 'Screening', booked: 'Booked', showed: 'Showed', client: 'Client', regular: 'Regular', lost: 'Lost' };
const SCREEN_WORDS: Record<ClientRecord['screeningResult'], string> = { pending: 'Not yet', pass: 'Passed', fail: 'Did not pass', withdrawn: 'Withdrew' };
const DEPOSIT_WORDS: Record<ClientRecord['depositStatus'], string> = { none: 'None', requested: 'Asked', paid: 'Paid', refunded: 'Refunded', forfeited: 'Kept' };
const LOST_WORDS: Record<NonNullable<ClientRecord['lostReason']>, string> = { no_reply: 'No reply', screening: 'Screening', price: 'Price', timing: 'Timing', no_show: 'No-show', boundaries: 'Boundaries', other: 'Other' };

const sel = 'w-full rounded-xl border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

function ClientForm({ client, onSave, onDelete, onClose }: { client: ClientRecord; onSave: (c: ClientRecord) => void; onDelete?: () => void; onClose: () => void }) {
  const [c, setC] = useState(client);
  const addSale = useAppStore((s) => s.addSale);
  const businesses = useAppStore((s) => s.businesses);
  const [paid, setPaid] = useState('');
  const set = (patch: Partial<ClientRecord>) => setC({ ...c, ...patch });
  const logPayment = async () => {
    const n = Number(paid);
    if (!Number.isFinite(n) || n <= 0) return;
    const biz = businesses.find((b) => b.id === c.businessId) ?? businesses.find((b) => b.active);
    if (!biz) return;
    const s: Sale = { id: newId('s'), profileId: c.profileId, businessId: biz.id, clientId: c.id, date: new Date().toISOString().slice(0, 10), amountCents: Math.round(n * 100), feeCents: 0, variableCostCents: 0, createdAt: new Date().toISOString() };
    await addSale(s);
    setPaid('');
  };
  return (
    <Card title={client.alias ? `Edit ${client.alias}` : 'New contact'} testId="client-form">
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium">Alias (never a real name)</span>
          <input data-testid="cf-alias" value={c.alias} onChange={(e) => set({ alias: e.target.value })} className={sel} maxLength={60} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Business</span>
          <select data-testid="cf-business" value={c.businessId ?? ''} onChange={(e) => set({ businessId: e.target.value || undefined })} className={sel}>
            <option value="">Not set</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Stage</span>
          <select data-testid="cf-stage" value={c.stage} onChange={(e) => set({ stage: e.target.value as ClientRecord['stage'] })} className={sel}>
            {CLIENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_WORDS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Screening result</span>
          <select data-testid="cf-screening" value={c.screeningResult} onChange={(e) => set({ screeningResult: e.target.value as ClientRecord['screeningResult'] })} className={sel}>
            {SCREENING_RESULTS.map((s) => (
              <option key={s} value={s}>
                {SCREEN_WORDS[s]}
              </option>
            ))}
          </select>
          <span className="block text-xs text-slate-500">The result only. Nothing about how you screen is stored.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Deposit</span>
          <select value={c.depositStatus} onChange={(e) => set({ depositStatus: e.target.value as ClientRecord['depositStatus'] })} className={sel}>
            {DEPOSIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DEPOSIT_WORDS[s]}
              </option>
            ))}
          </select>
        </label>
        {c.stage === 'lost' && (
          <label className="block text-sm">
            <span className="font-medium">Why lost</span>
            <select value={c.lostReason ?? ''} onChange={(e) => set({ lostReason: (e.target.value || undefined) as ClientRecord['lostReason'] })} className={sel}>
              <option value="">Not set</option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {LOST_WORDS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium">Agreed budget a month (regulars)</span>
          <input data-testid="cf-budget" type="number" inputMode="decimal" value={c.agreedBudgetCents === null ? '' : c.agreedBudgetCents / 100} onChange={(e) => set({ agreedBudgetCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })} className={sel} placeholder="not set" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.contactConsent} onChange={(e) => set({ contactConsent: e.target.checked })} className="h-5 w-5" />
          <span>They are fine with me reaching out</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Next action</span>
          <input value={c.nextAction ?? ''} onChange={(e) => set({ nextAction: e.target.value || undefined })} className={sel} maxLength={120} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Notes (optional; keep them plain)</span>
          <textarea value={c.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} className={sel} rows={2} maxLength={2000} />
        </label>
        {client.alias && (
          <div className="flex gap-2">
            <input data-testid="cf-paid" type="number" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Log a payment ($)" className={sel} />
            <button type="button" data-testid="cf-log" onClick={() => void logPayment()} className="shrink-0 rounded-xl border border-slate-300 px-3 dark:border-slate-700">
              Log
            </button>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button kind="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button testId="cf-save" disabled={!c.alias.trim()} onClick={() => onSave({ ...c, alias: c.alias.trim(), updatedAt: new Date().toISOString() })}>
          Save
        </Button>
      </div>
      {onDelete && (
        <div className="mt-2">
          <ConfirmButton onConfirm={onDelete} confirmLabel="Tap again to delete for good">
            Delete this record
          </ConfirmButton>
        </div>
      )}
    </Card>
  );
}

function FromYourLog() {
  const clients = useAppStore((s) => s.clients);
  const businesses = useAppStore((s) => s.businesses);
  const setInput = useAppStore((s) => s.setInput);
  const [used, setUsed] = useState(false);
  const inPerson = businesses.filter((b) => b.active && b.type === 'inPerson')[0];
  const f = useMemo(() => funnelFromLog(clients, inPerson?.id ?? null), [clients, inPerson?.id]);
  if (!inPerson || f.contacts === 0) return null;
  const use = async () => {
    if (f.contactsPerMonth !== null) await setInput(inPerson.id, 'inquiriesPerMonth', Math.round(f.contactsPerMonth), 'Yours', 'from your client log');
    if (f.passRate !== null) await setInput(inPerson.id, 'passRate', f.passRate, 'Yours', 'from your client log');
    if (f.bookingRate !== null) await setInput(inPerson.id, 'bookingRate', f.bookingRate, 'Yours', 'from your client log');
    if (f.showRate !== null) await setInput(inPerson.id, 'showRate', f.showRate, 'Yours', 'from your client log');
    setUsed(true);
  };
  return (
    <Card title="From your log, last 90 days" testId="from-log">
      <p className="text-sm">
        {f.contacts} contacted · {f.passed} passed screening · {f.booked} booked · {f.showed} showed
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Pass {f.passRate === null ? 'not yet' : percent(f.passRate)} · booking {f.bookingRate === null ? 'not yet' : percent(f.bookingRate)} · show {f.showRate === null ? 'not yet' : percent(f.showRate)} · about {f.contactsPerMonth === null ? '?' : count(f.contactsPerMonth, 0)} contacts a month
      </p>
      {f.enough ? (
        <div className="mt-3">
          {used ? (
            <Note tone="good" testId="log-used">These rates are now your in-person numbers, labeled yours.</Note>
          ) : (
            <Button kind="secondary" testId="use-log" onClick={() => void use()}>
              Use these rates in my numbers
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">After {LOG_MIN_CONTACTS} contacts these can replace your estimates in one tap ({LOG_MIN_CONTACTS - f.contacts} to go).</p>
      )}
    </Card>
  );
}

export function Clients() {
  const profile = useAppStore((s) => s.profile);
  const clients = useAppStore((s) => s.clients);
  const sales = useAppStore((s) => s.sales);
  const putClient = useAppStore((s) => s.putClient);
  const deleteClient = useAppStore((s) => s.deleteClient);
  const mode = useLabelMode();
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [stageFilter, setStageFilter] = useState<ClientRecord['stage'] | 'all'>('all');
  const month = new Date().toISOString().slice(0, 7);
  const flags = useMemo(() => budgetCheck(clients, sales, month), [clients, sales, month]);
  const businesses = useAppStore((s) => s.businesses);
  const firstBusinessId = businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0]?.id;
  if (!profile) return null;

  const blank = (): ClientRecord => ({
    id: newId('c'),
    profileId: profile.id,
    alias: '',
    ...(firstBusinessId ? { businessId: firstBusinessId } : {}),
    stage: 'inquiry',
    keyDates: { firstContact: new Date().toISOString().slice(0, 10) },
    screeningResult: 'pending',
    depositStatus: 'none',
    offersBought: [],
    contactConsent: false,
    agreedBudgetCents: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  if (editing) {
    const isNew = !clients.some((c) => c.id === editing.id);
    return (
      <ClientForm
        client={editing}
        onClose={() => setEditing(null)}
        onSave={(c) => {
          void putClient(c);
          setEditing(null);
        }}
        onDelete={
          isNew
            ? undefined
            : () => {
                void deleteClient(editing.id);
                setEditing(null);
              }
        }
      />
    );
  }

  const counts = CLIENT_STAGES.map((s) => [s, clients.filter((c) => c.stage === s).length] as const).filter(([, n]) => n > 0);
  const shown = stageFilter === 'all' ? clients : clients.filter((c) => c.stage === stageFilter);

  return (
    <div className="space-y-4">
      <Button testId="new-client" onClick={() => setEditing(blank())}>
        + Log a contact
      </Button>
      <FromYourLog />
      {flags.length > 0 && (
        <Note tone="warn" testId="client-flags">
          {flags.map((f) => `${f.alias} is ${money(f.overByCents, { whole: true })} past their agreed budget`).join('; ')}. Time for a check-in.
        </Note>
      )}
      <Card title={mode === 'pro' ? 'Pipeline' : 'Where everyone is'} testId="client-list">
        {clients.length === 0 ? (
          <Empty>No contacts logged yet. Each one is an alias and a stage; that is all this needs.</Empty>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-1">
              <button type="button" onClick={() => setStageFilter('all')} className={`rounded-full px-2.5 py-1 text-xs ${stageFilter === 'all' ? 'bg-sky-700 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                All {clients.length}
              </button>
              {counts.map(([s, n]) => (
                <button key={s} type="button" data-testid={`filter-${s}`} onClick={() => setStageFilter(stageFilter === s ? 'all' : s)} className={`rounded-full px-2.5 py-1 text-xs ${stageFilter === s ? 'bg-sky-700 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  {STAGE_WORDS[s]} {n}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((c) => (
                <li key={c.id}>
                  <button type="button" data-testid={`client-${c.alias}`} onClick={() => setEditing(c)} className="flex w-full items-center justify-between py-3 text-left">
                    <span>
                      <span className="font-medium">{c.alias}</span>
                      <span className="block text-xs text-slate-500">
                        {STAGE_WORDS[c.stage]} · screening: {SCREEN_WORDS[c.screeningResult]}
                        {c.nextAction ? ` · next: ${c.nextAction}` : ''}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="px-1 text-xs text-slate-500">Aliases only. No legal names, documents, photos or addresses can be stored here, by design.</p>
    </div>
  );
}
