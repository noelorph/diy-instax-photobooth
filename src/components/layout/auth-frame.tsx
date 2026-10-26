import { Camera } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './auth-frame.module.css';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className={`public-auth ${styles.frame}`} data-theme="light">
      <section className={styles.panel}>
        <div className={styles.brand}>
          <Camera size={32} aria-hidden="true" />
          <span>Photo Booth</span>
        </div>
        {children}
      </section>
    </main>
  );
}
