/* One tap hides the app behind a plain screen; a tap on the small return
   link brings it back. Nothing on this screen names the app or the work. */
interface Props {
  onReturn(): void;
}

export function QuickHide({ onReturn }: Props) {
  return (
    <div data-testid="quick-hide" className="fixed inset-0 z-50 flex flex-col bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <header className="border-b border-slate-200 px-4 py-3 text-base font-medium dark:border-slate-800">Notes</header>
      <main className="flex-1 px-4 py-6">
        <ul className="space-y-3 text-slate-500">
          <li>Groceries</li>
          <li>Call back about the appointment</li>
          <li>Water the plants</li>
        </ul>
      </main>
      <footer className="px-4 py-6">
        <button
          type="button"
          onClick={onReturn}
          className="w-full rounded-lg px-3 py-3 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-600"
          aria-label="Return"
        >
          &middot;
        </button>
      </footer>
    </div>
  );
}
