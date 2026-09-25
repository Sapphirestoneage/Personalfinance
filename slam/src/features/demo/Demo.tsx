/* Demo, backup and settings: sample profiles, presenter view, reset,
   backup in and out, and the snapshot for Sapphire. */
import { useRef, useState } from 'react';
import { useAppStore } from '@/data/store';
import { SAMPLES } from '@/content/samples';
import { EXPORT_REMINDER, exportFileName } from '@/data/transfer';
import { CONTACT_NAME, NON_AFFILIATION, NO_ADVICE, ON_DEVICE } from '@/content/credits';
import { navigate } from '@/app/router';
import { Button, Card, ConfirmButton, Note, Toggle } from '../shared/ui';

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Demo() {
  const profile = useAppStore((s) => s.profile);
  const presenter = useAppStore((s) => s.presenter);
  const setPresenter = useAppStore((s) => s.setPresenter);
  const loadSample = useAppStore((s) => s.loadSample);
  const resetFresh = useAppStore((s) => s.resetFresh);
  const exportBackup = useAppStore((s) => s.exportBackup);
  const importBackup = useAppStore((s) => s.importBackup);
  const snapshotText = useAppStore((s) => s.snapshotText);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const businesses = useAppStore((s) => s.businesses);
  if (!profile) return null;
  /* a fresh profile nobody has typed into can be replaced without asking */
  const hasOwnNumbers = businesses.some((b) => Object.values(b.inputs).some((a) => a.label === 'Yours')) || Object.values(profile.settings).some((a) => a.label === 'Yours');

  const onImport = async (file: File | undefined) => {
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

  return (
    <div className="space-y-4">
      <Card title="Backup" testId="backup-card">
        <p className="mb-3 text-xs text-slate-500">{ON_DEVICE}</p>
        <div className="space-y-2">
          <Button testId="export" onClick={() => void exportBackup().then((t) => { download(t, exportFileName()); setNote(EXPORT_REMINDER); })}>
            Save a backup file
          </Button>
          <Button kind="secondary" testId="import" onClick={() => fileRef.current?.click()}>
            Restore from a file
          </Button>
          <input ref={fileRef} data-testid="import-file" type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e.target.files?.[0])} />
          <Button kind="secondary" testId="snapshot" onClick={() => { download(snapshotText(), exportFileName(new Date(), 'snapshot')); setNote(`Snapshot saved. Send the file to ${CONTACT_NAME} however you usually share files. It holds your numbers and week logs, never client records. ${EXPORT_REMINDER}`); }}>
            Snapshot to send to {CONTACT_NAME}
          </Button>
        </div>
        {note && (
          <div className="mt-3">
            <Note testId="note">{note}</Note>
          </div>
        )}
      </Card>

      <Card title="Demo mode" testId="demo-card">
        <p className="mb-3 text-xs text-slate-500">{profile.demo ? `Showing "${profile.alias}". Sample numbers, not anyone's.` : 'Load a sample to walk someone through the app. Save a backup first if this device holds your own numbers.'}</p>
        <div className="space-y-2">
          {SAMPLES.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <span className="block font-medium">{s.title}</span>
              <span className="mb-2 block text-xs text-slate-500">{s.blurb}</span>
              {profile.demo || !hasOwnNumbers ? (
                <Button kind="secondary" testId={`sample-${s.id}`} onClick={() => void loadSample(s.id).then(() => navigate('today'))}>
                  Load this sample
                </Button>
              ) : (
                <ConfirmButton kind="secondary" testId={`sample-${s.id}`} confirmLabel="Tap again: this replaces your numbers" onConfirm={() => void loadSample(s.id).then(() => navigate('today'))}>
                  Load this sample
                </ConfirmButton>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Toggle on={presenter} onChange={setPresenter} label="Presenter view (bigger text)" testId="presenter" />
          <ConfirmButton testId="reset" confirmLabel="Tap again: everything here is removed" onConfirm={() => void resetFresh().then(() => navigate('today'))}>
            Start over, empty
          </ConfirmButton>
        </div>
      </Card>

      <footer className="space-y-2 px-1 text-xs text-slate-500">
        <p>{NO_ADVICE}</p>
        <p>{NON_AFFILIATION}</p>
      </footer>
    </div>
  );
}
