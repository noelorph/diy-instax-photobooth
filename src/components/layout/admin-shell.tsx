'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminNavigation } from '@/components/layout/admin-navigation';
import styles from './admin-shell.module.css';

export function AdminShell({ children, theme }: { children: ReactNode; theme: 'light' | 'dark' }) {
  const pathname = usePathname();
  return (
    <div className={`admin-shell ${styles.shell}`} data-theme={theme}>
      <a className={styles.skipLink} href="#admin-content">
        Skip to content
      </a>
      <AdminNavigation pathname={pathname} />
      <main id="admin-content" tabIndex={-1} className={`shell-content ${styles.content}`}>
        {children}
      </main>
    </div>
  );
}
