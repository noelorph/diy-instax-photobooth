import type { ReactNode } from 'react';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="public-auth" data-theme="light">
      <section className="auth-panel">
        <span className="auth-photo-frame" aria-hidden="true" />
        {children}
      </section>
    </main>
  );
}
