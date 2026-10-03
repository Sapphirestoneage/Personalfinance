/* If a screen throws, show a way out instead of a blank page: reload, or
   go to the backup screen. Nothing here reads the store, so it cannot
   throw the same way. */
import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-8" data-testid="error-screen">
        <h1 className="text-lg font-semibold">Something went wrong on this screen.</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Your numbers are still saved on this device. Reloading usually fixes it; if it keeps happening, save a backup and start over from the backup screen.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{this.state.error.message}</pre>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-sky-700 px-4 py-3 font-medium text-white">
            Reload
          </button>
          <a
            href="#/demo"
            onClick={() => this.setState({ error: null })}
            className="rounded-xl border border-slate-300 px-4 py-3 text-center font-medium dark:border-slate-700"
          >
            Backup screen
          </a>
        </div>
      </div>
    );
  }
}
