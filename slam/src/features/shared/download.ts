/* Hand the viewer a file. Inside the claude.ai preview the page cannot
   start a download itself, so it asks the viewer through the runtime's
   `downloads` capability when that is present; everywhere else it uses
   the browser's own download. Never silent: the caller gets the outcome. */
export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

interface RuntimeDownloads {
  save(req: { filename: string; data: string }): Promise<{ status: string }>;
}
interface Runtime {
  use?(name: string): Promise<RuntimeDownloads | null>;
}

export async function saveFile(text: string, filename: string): Promise<SaveOutcome> {
  const runtime = (window as unknown as { claude?: Runtime }).claude;
  if (runtime && typeof runtime.use === 'function') {
    try {
      const downloads = await runtime.use('downloads');
      if (downloads) {
        try {
          await downloads.save({ filename, data: text });
          return 'saved';
        } catch (e) {
          const code = (e as { code?: string } | null)?.code;
          return code === 'declined' ? 'declined' : 'unavailable';
        }
      }
    } catch {
      /* fall through to the browser */
    }
  }
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
