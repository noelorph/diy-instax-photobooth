import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
      <div className="min-w-0 flex-1 basis-64">
        <h1 className="m-0 text-[1.75rem] leading-9 font-semibold text-ds-text wrap-anywhere">
          {title}
        </h1>
        {description && (
          <p className="mt-1 mb-0 max-w-prose text-base leading-6 text-ds-text-muted">
            {description}
          </p>
        )}
        {meta && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm leading-5 text-ds-text-muted tabular-nums">
            {meta}
          </div>
        )}
      </div>
      {action && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{action}</div>}
    </header>
  );
}
