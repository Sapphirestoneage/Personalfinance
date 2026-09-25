/* How SLAM thinks: one screen, plain words, for anyone from a first-time
   user to the person who runs the cohort. No jargon unless Pro mode. */
import { APP_NAME, CONTACT_NAME, NON_AFFILIATION, NO_ADVICE, ON_DEVICE } from '@/content/credits';
import { STAGES } from '@/content/stages';
import { Card } from '../shared/ui';
import { useLabelMode } from '../shared/hooks';

const FLOW: Array<[string, string]> = [
  ['Contacts', 'Everyone who reaches out in a month.'],
  ['Screening', 'Your process, exactly as it is. The app never treats it as a sales step or suggests loosening it.'],
  ['Bookings', 'The share of screened people who book, and of those, who turn up.'],
  ['Sessions', 'First sessions, rebooks, and any retainer or program on top.'],
  ['Gross profit', 'What each sale leaves after the platform cut and what it cost you to deliver.'],
  ['Profit', 'Gross profit across every counted business, minus what you spend finding clients and your fixed costs.'],
];

export function About() {
  const mode = useLabelMode();
  return (
    <div className="space-y-4">
      <Card title={`How ${APP_NAME} thinks`} testId="about">
        <p className="text-sm text-slate-600 dark:text-slate-300">Every screen answers one question about the same chain. Change one link and the profit at the end moves; the app shows you by how much.</p>
        <ol className="mt-3 space-y-2">
          {FLOW.map(([name, text], i) => (
            <li key={name} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">{i + 1}</span>
              <span>
                <span className="font-medium">{name}.</span> {text}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Yours or an estimate">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Every number carries a label. <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">estimate</span> means the app started you off with a typical figure so a screen could answer straight away. <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">yours</span> means you typed it, or it came from your own log or check-ins. Any result built on an estimate says so underneath.
        </p>
      </Card>

      <Card title="The pathway">
        <p className="text-sm text-slate-600 dark:text-slate-300">Your #1 business goes through every stage; the next business starts at the diagnosis. Each stage is one tool that asks one question at a time. The Toolbox holds the same tools to try things without saving.</p>
        <ol className="mt-2 grid grid-cols-1 gap-1 text-sm">
          {STAGES.map((s, i) => (
            <li key={s.stage} className="flex gap-2">
              <span className="w-5 shrink-0 text-right text-slate-400">{i + 1}</span>
              <span>
                <span className="font-medium">{s.title}.</span> <span className="text-slate-600 dark:text-slate-300">{s.question}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Three futures">
        <p className="text-sm text-slate-600 dark:text-slate-300">Normal is your numbers as they stand. Dream and Disaster move contacts, audience and conversion by set amounts, and you can switch on events (a platform ban, a month off sick, a viral post) to see what they do to each business and to how long your cash lasts.</p>
      </Card>

      <Card title="Private by design">
        <p className="text-sm text-slate-600 dark:text-slate-300">{ON_DEVICE} Clients are aliases with a stage and a screening result, never names, documents or addresses. Backups and the snapshot for {CONTACT_NAME} are plain files with neutral names. The Hide button swaps the screen for a plain page in one tap.</p>
      </Card>

      {mode === 'pro' && (
        <Card title="Under the hood">
          <p className="text-sm text-slate-600 dark:text-slate-300">Pure formulas F01 to F12, F23 and F24, checked against twenty-one golden cases every build. Pro mode spells the math out on each business tab with your numbers in it. Money is kept in whole cents; rates are fractions; an empty field is never read as zero.</p>
        </Card>
      )}

      <footer className="space-y-2 px-1 text-xs text-slate-500">
        <p>{NO_ADVICE}</p>
        <p>{NON_AFFILIATION}</p>
      </footer>
    </div>
  );
}
