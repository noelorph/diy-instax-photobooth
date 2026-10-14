'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
const destinations = ['Dashboard', 'Events', 'History', 'Profile'];
export function AppShell({ children, theme }: { children: ReactNode; theme: 'light' | 'dark' }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="admin-shell"
      data-theme={theme}
      data-menu-open={open}
      data-rail-expanded={expanded}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <a className="skip-link" href="#admin-content">
        Skip to content
      </a>
      <header className="shell-mobile-header">
        <span>Instax Photo Booth</span>
        <button
          ref={trigger}
          type="button"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          aria-controls="admin-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
      </header>
      <aside className="shell-sidebar">
        <p className="shell-brand">
          Instax
          <br />
          Photo Booth
        </p>
        <button
          className="rail-toggle"
          type="button"
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded}
          aria-controls="admin-navigation"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        <nav id="admin-navigation" aria-label="Admin">
          <ul>
            {destinations.map((label) => {
              const href = `/${label.toLowerCase()}`;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={
                      pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined
                    }
                    onClick={() => setOpen(false)}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main id="admin-content" tabIndex={-1} className="shell-content">
        {children}
      </main>
    </div>
  );
}
