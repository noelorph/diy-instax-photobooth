import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-ds-border bg-ds-primary-soft px-6 py-10 text-center">
      <h2 className="m-0 text-lg leading-[1.625rem] font-semibold text-ds-text">{title}</h2>
      <p className="mx-auto mt-2 mb-0 max-w-prose text-base leading-6 text-ds-text-muted">
        {description}
      </p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </section>
  );
}
