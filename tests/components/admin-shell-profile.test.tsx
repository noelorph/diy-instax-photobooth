import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from '@/features/admin/app-shell';
import { Profile } from '@/features/admin/profile/profile';
const route = vi.hoisted(() => ({ pathname: '/profile' }));
beforeEach(() => {
  route.pathname = '/profile';
});
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => route.pathname,
}));
afterEach(cleanup);
const initial = { email: 'owner@example.test', phone: '', theme: 'light' as const };
const ok = async () => ({ confirmation: 'Saved.' });
it('associates the phone helper and current inline error with its control', async () => {
  render(
    <Profile
      initial={initial}
      saveAction={async () => ({ fieldErrors: { phone: 'Enter a valid phone number.' } })}
      passwordAction={ok}
      signOutAction={ok}
    />
  );
  const phone = screen.getByLabelText('Phone number');
  const descriptions = () =>
    (phone.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent);
  expect(descriptions()).toContain('Optional. Include your country code.');
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByRole('alert');
  expect(descriptions()).toEqual([
    'Optional. Include your country code.',
    'Enter a valid phone number.',
  ]);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')));
});
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
  const menu = screen.getByRole('button', { name: 'Open navigation menu' });
  fireEvent.click(menu);
  expect(menu.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' });
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(menu);
});
it('closes the open compact menu with Escape from main content and restores trigger focus', () => {
  render(
    <AppShell theme="light">
      <button type="button">Save changes</button>
    </AppShell>
  );
  const menu = screen.getByRole('button', { name: 'Open navigation menu' });
  fireEvent.click(menu);
  const contentControl = screen.getByRole('button', { name: 'Save changes' });
  contentControl.focus();
  fireEvent.keyDown(contentControl, { key: 'Escape' });
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(menu);
  contentControl.focus();
  fireEvent.keyDown(contentControl, { key: 'Escape' });
  expect(document.activeElement).toBe(contentControl);
});
it.each(['/events/new', '/events/draft-123'])('selects Events on %s', (pathname) => {
  route.pathname = pathname;
  render(
    <AppShell theme="light">
      <h1>Event</h1>
    </AppShell>
  );
  expect(screen.getByRole('link', { name: 'Events' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBeNull();
});
it('keeps destination names available as the medium rail expands and collapses', () => {
  render(
    <AppShell theme="light">
      <h1>Profile</h1>
    </AppShell>
  );
  const toggle = screen.getByRole('button', { name: 'Expand navigation' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(
    screen.getByRole('button', { name: 'Collapse navigation' }).getAttribute('aria-expanded')
  ).toBe('true');
  fireEvent.click(toggle);
  for (const name of ['Dashboard', 'Events', 'History', 'Profile']) {
    expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(`/${name.toLowerCase()}`);
  }
});
it('provides a skip link to the focusable main content', () => {
  render(
    <AppShell theme="light">
      <h1>Profile</h1>
    </AppShell>
  );
  const main = screen.getByRole('main');
  expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
    `#${main.id}`
  );
  expect(main.getAttribute('tabindex')).toBe('-1');
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
it('hides saved feedback when either preference differs from the saved values', async () => {
  render(<Profile initial={initial} saveAction={ok} passwordAction={ok} signOutAction={ok} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Saved.');

  fireEvent.change(screen.getByLabelText('Phone number'), {
    target: { value: '+63 917 123 4567' },
  });
  expect(screen.queryByText('Saved.')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Saved.');
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(screen.queryByText('Saved.')).toBeNull();
});
it('keeps submitted preferences fixed while saving and restores editing after confirmation', async () => {
  let finish!: (value: { confirmation: string }) => void;
  render(
    <Profile
      initial={initial}
      saveAction={() =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
      passwordAction={ok}
      signOutAction={ok}
    />
  );
  const phone = screen.getByLabelText('Phone number') as HTMLInputElement;
  const theme = screen.getByRole('radio', { name: 'Dark' }) as HTMLInputElement;
  fireEvent.change(phone, { target: { value: '+63 917 123 4567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Saving preferences…');
  expect(phone.disabled).toBe(true);
  expect(theme.disabled).toBe(true);

  finish({ confirmation: 'Preferences saved.' });
  await screen.findByText('Preferences saved.');
  expect(phone.disabled).toBe(false);
  expect(theme.disabled).toBe(false);
  fireEvent.click(theme);
  expect(screen.queryByText('Preferences saved.')).toBeNull();
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
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')));
  expect((screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement).disabled).toBe(
    false
  );
});
it('associates appearance and password errors with the affected controls', async () => {
  render(
    <Profile
      initial={initial}
      saveAction={async () => ({ fieldErrors: { theme: 'Choose an appearance.' } })}
      passwordAction={async () => ({
        fieldErrors: { password: 'Use a longer password.', confirmation: 'Passwords must match.' },
      })}
      signOutAction={ok}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Choose an appearance.');
  const appearance = screen.getByRole('radiogroup', { name: 'Admin appearance' });
  expect(appearance.getAttribute('aria-invalid')).toBe('true');
  const dark = screen.getByRole('radio', { name: 'Dark' });
  expect(dark.hasAttribute('aria-invalid')).toBe(false);
  expect(document.getElementById(dark.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Choose an appearance.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  await screen.findByText('Passwords must match.');
  for (const [label, message] of [
    ['New password', 'Use a longer password.'],
    ['Confirm new password', 'Passwords must match.'],
  ]) {
    const control = screen.getByLabelText(label);
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(control.getAttribute('aria-describedby')!)?.textContent).toBe(
      message
    );
  }
});

it('presents four Profile sections, verified email, and saved appearance choices', () => {
  render(<Profile initial={initial} saveAction={ok} passwordAction={ok} signOutAction={ok} />);
  for (const name of ['Account', 'Appearance', 'Change password', 'Sign out']) {
    expect(screen.getByRole('region', { name })).toBeTruthy();
  }
  const email = screen.getByLabelText('Email (Admin)') as HTMLInputElement;
  expect(email.readOnly).toBe(true);
  expect(email.value).toBe(initial.email);
  expect((screen.getByRole('radio', { name: 'Light' }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText(/Your other devices and Booth Mode stay signed in/)).toBeTruthy();
});

it('preserves both preferences and focuses persistent feedback after a failed save', async () => {
  render(
    <Profile
      initial={initial}
      saveAction={async () => ({ error: 'Preferences could not be saved.' })}
      passwordAction={ok}
      signOutAction={ok}
    />
  );
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+639171234567' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  const alert = await screen.findByRole('alert');
  expect((screen.getByRole('radio', { name: 'Dark' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('+639171234567');
  expect(screen.queryByText('Saved.')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(alert));
});
it('keeps an unknown sign-out outcome visible and actionable', async () => {
  render(
    <Profile
      initial={initial}
      saveAction={ok}
      passwordAction={ok}
      signOutAction={async () => {
        throw new Error('offline');
      }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('could not be confirmed');
  expect((screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement).disabled).toBe(
    false
  );
  await waitFor(() => expect(document.activeElement).toBe(alert));
});
it('marks only the chosen appearance with a persistent check and updates it when changed', () => {
  render(<Profile initial={initial} saveAction={ok} passwordAction={ok} signOutAction={ok} />);
  const light = screen.getByRole('radio', { name: 'Light' }).closest('label')!;
  const dark = screen.getByRole('radio', { name: 'Dark' }).closest('label')!;
  expect(within(light).getByText('✓')).toBeTruthy();
  expect(within(dark).queryByText('✓')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(within(dark).getByText('✓')).toBeTruthy();
  expect(within(light).queryByText('✓')).toBeNull();
});
