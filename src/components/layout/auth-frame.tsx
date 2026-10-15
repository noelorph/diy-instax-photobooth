import type { ReactNode } from 'react';
import styles from './auth-frame.module.css';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className={`public-auth ${styles.frame}`} data-theme="light">
      <section className={styles.panel}>
        <span className={styles.photoFrame} aria-hidden="true" />
        {children}
      </section>
    </main>
  );
}
