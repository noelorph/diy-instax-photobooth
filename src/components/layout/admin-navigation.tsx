'use client';

import Link from 'next/link';
import {
  CalendarDays,
  History,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import styles from './admin-shell.module.css';

const destinations = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Events', href: '/events', icon: CalendarDays },
  { label: 'History', href: '/history', icon: History },
  { label: 'Profile', href: '/profile', icon: UserRound },
];

function Brand() {
  return (
    <span className={styles.brand}>
      <span className={styles.photoFrame} aria-hidden="true" />
      <span className={styles.brandLabel}>
        Instax
        <br />
        Photo Booth
      </span>
    </span>
  );
}

export function AdminNavigation({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  return (
    <div className={styles.navigation} data-menu-open={open} data-rail-expanded={expanded}>
      <header className={styles.mobileHeader}>
        <Brand />
        <Button
          ref={trigger}
          variant="secondary"
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          aria-controls="admin-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />} Menu
        </Button>
      </header>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <Brand />
        </div>
        <Button
          className={styles.railToggle}
          variant="quiet"
          type="button"
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          title={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded}
          aria-controls="admin-navigation"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
          <span className={styles.toggleLabel}>{expanded ? 'Collapse' : 'Expand'}</span>
        </Button>
        <nav id="admin-navigation" aria-label="Admin" className={styles.destinations}>
          <ul>
            {destinations.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  title={label}
                  aria-current={
                    pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined
                  }
                  onClick={() => setOpen(false)}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span className={styles.destinationLabel}>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
