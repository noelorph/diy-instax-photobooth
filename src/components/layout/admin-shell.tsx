'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { AdminNavigation } from '@/components/layout/admin-navigation';
import styles from './admin-shell.module.css';

const HistoryPathContext = createContext<Dispatch<SetStateAction<string | null>> | null>(null);

export function HistoryNavigation() {
  const pathname = usePathname();
  const setHistoryPath = useContext(HistoryPathContext);
  useEffect(() => {
    setHistoryPath?.(pathname);
    return () => setHistoryPath?.(null);
  }, [pathname, setHistoryPath]);
  return null;
}

export function AdminShell({ children, theme }: { children: ReactNode; theme: 'light' | 'dark' }) {
  const pathname = usePathname();
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  return (
    <HistoryPathContext value={setHistoryPath}>
      <div className={`admin-shell ${styles.shell}`} data-theme={theme}>
        <a className={styles.skipLink} href="#admin-content">
          Skip to content
        </a>
        <AdminNavigation pathname={historyPath === pathname ? '/history' : pathname} />
        <main id="admin-content" tabIndex={-1} className={`shell-content ${styles.content}`}>
          {children}
        </main>
      </div>
    </HistoryPathContext>
  );
}
