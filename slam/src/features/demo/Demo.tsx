/* Demo, backup and settings: sample profiles, presenter view, reset,
   backup in and out, and the snapshot for Sapphire. */
import { useRef, useState } from 'react';
import { useAppStore } from '@/data/store';
import { SAMPLES } from '@/content/samples';
import { EXPORT_REMINDER, exportFileName } from '@/data/transfer';
import { CONTACT_NAME, NON_AFFILIATION, NO_ADVICE, ON_DEVICE } from '@/content/credits';
import { navigate } from '@/app/router';
import { Button, Card, Note, Toggle } from '../shared/ui';

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
  if (!profile) return null;

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
            <button
              key={s.id}
              type="button"
              data-testid={`sample-${s.id}`}
              onClick={() => {
                if (profile.demo || window.confirm('Replace what is on this device with this sample? Save a backup first if you need it.')) void loadSample(s.id).then(() => navigate('today'));
              }}
              className="block w-full rounded-xl border border-slate-200 p-3 text-left dark:border-slate-800"
            >
              <span className="block font-medium">{s.title}</span>
              <span className="block text-xs text-slate-500">{s.blurb}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Toggle on={presenter} onChange={setPresenter} label="Presenter view (bigger text)" testId="presenter" />
          <Button
            kind="danger"
            testId="reset"
            onClick={() => {
              if (window.confirm('Start over with an empty profile? Everything on this device is removed. This cannot be undone.')) void resetFresh().then(() => navigate('today'));
            }}
          >
            Start over, empty
          </Button>
        </div>
      </Card>

      <footer className="space-y-2 px-1 text-xs text-slate-500">
        <p>{NO_ADVICE}</p>
        <p>{NON_AFFILIATION}</p>
      </footer>
    </div>
  );
}
