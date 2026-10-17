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
    <section className="border-t border-ds-border-subtle py-8">
      <h2 className="m-0 text-xl leading-7 font-semibold text-ds-text">{title}</h2>
      <p className="mt-2 mb-0 max-w-prose text-base leading-[1.375rem] text-ds-text-muted">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
