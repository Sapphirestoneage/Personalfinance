import { useAppStore } from '@/data/store';
import { href } from '@/app/router';
import { useLabelMode } from './hooks';
import { describeMissing } from './missing';

/** "Not enough to compute yet" as a list of the exact fields, each a link. */
export function MissingList({ keys, currentBusinessId, testId }: { keys: string[]; currentBusinessId?: string; testId?: string }) {
  const businesses = useAppStore((s) => s.businesses);
  const mode = useLabelMode();
  const items = keys.map((k) => describeMissing(k, businesses, mode, currentBusinessId));
  return (
    <div data-testid={testId} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
      <p className="font-medium">Not enough to add up yet. Still needed:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((m) => (
          <li key={m.key}>
            <a href={href(m.to)} className="underline">
              {m.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
