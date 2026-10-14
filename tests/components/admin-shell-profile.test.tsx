import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from '@/features/admin/app-shell';
import { Profile } from '@/features/admin/profile/profile';
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/profile',
}));
afterEach(cleanup);
const initial = { email: 'owner@example.test', phone: '', theme: 'light' as const };
const ok = async () => ({ confirmation: 'Saved.' });
it('keeps Profile last and marks the current destination', () => {
  render(
    <AppShell theme="dark">
      <h1>Profile</h1>
    </AppShell>
  );
  const links = within(screen.getByRole('navigation')).getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual([
    'Dashboard',
    'Events',
    'History',
    'Profile',
  ]);
  expect(links[3].getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('heading').closest('[data-theme]')?.getAttribute('data-theme')).toBe(
    'dark'
  );
});
it('opens the compact menu and Escape restores focus to its trigger', () => {
  render(
    <AppShell theme="light">
      <h1>Profile</h1>
    </AppShell>
  );
  const menu = screen.getByRole('button', { name: 'Open navigation' });
  fireEvent.click(menu);
  expect(menu.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' });
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(menu);
});
it('preserves changed fields after save failure and exposes validation feedback', async () => {
  render(
    <Profile
      initial={initial}
      saveAction={async () => ({ fieldErrors: { phone: 'Enter a valid phone number.' } })}
      passwordAction={ok}
      signOutAction={ok}
    />
  );
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('invalid');
  expect(screen.getByLabelText('Phone number').getAttribute('aria-invalid')).toBe('true');
});
it('prevents duplicate saves, displays success, and recovers from a transport failure', async () => {
  let finish!: (value: { confirmation: string }) => void;
  render(
    <Profile
      initial={initial}
      saveAction={() =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
      passwordAction={async () => {
        throw new Error('offline');
      }}
      signOutAction={ok}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Saving preferences…');
  expect(
    (screen.getByRole('button', { name: 'Save preferences' }) as HTMLButtonElement).disabled
  ).toBe(true);
  finish({ confirmation: 'Preferences saved.' });
  await screen.findByText('Preferences saved.');
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/connection.*try again/i);
  expect(
    (screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement).disabled
  ).toBe(false);
});
it('keeps failed sign-out actionable without claiming the session ended', async () => {
  render(
    <Profile
      initial={initial}
      saveAction={ok}
      passwordAction={ok}
      signOutAction={async () => ({ error: 'You are still signed in. Try again.' })}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/still signed in/i);
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
});
