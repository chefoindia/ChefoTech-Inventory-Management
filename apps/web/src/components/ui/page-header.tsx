import { AskAi } from '@/components/ai/assistant';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
  help = true,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** "What is this?" AI help. Defaults to a question about the page; pass a custom question or `false` to hide. */
  help?: string | boolean;
}) {
  const helpQuestion = help === false ? null : typeof help === 'string' ? help : `What is the "${title}" page for and how do I use it? Explain in simple words.`;
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold leading-tight text-fg">{title}</h1>
          {helpQuestion ? <AskAi question={helpQuestion} label="What is this?" /> : null}
        </div>
        {description ? <p className="mt-1 text-[13px] text-fg-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description ? <p className="text-[13px] text-fg-subtle">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
