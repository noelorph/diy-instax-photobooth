import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResetPasswordForm } from '@/features/admin/auth/reset-form';
afterEach(cleanup);

describe('Public password reset form', () => {
  it('offers labeled new passwords, persistent validation and preserves values for retry', async () => {
    render(
      <ResetPasswordForm
        action={async () => ({ fieldErrors: { confirmation: 'The passwords must match.' } })}
      />
    );
    const password = screen.getByLabelText('New password') as HTMLInputElement;
    const confirmation = screen.getByLabelText('Confirm new password') as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'A-secure-password!' } });
    fireEvent.change(confirmation, { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await screen.findByText('The passwords must match.');
    expect(password.value).toBe('A-secure-password!');
    expect(confirmation.value).toBe('different');
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(confirmation.getAttribute('aria-describedby')!)?.textContent
    ).toMatch(/must match/);
    fireEvent.change(confirmation, { target: { value: 'edited' } });
    expect(screen.getByRole('alert').textContent).toMatch(/highlighted/);
  });

  it('offers another link for invalid recovery without showing password fields or Admin navigation', () => {
    render(<ResetPasswordForm action={vi.fn()} invalidLink />);
    expect(screen.getByRole('alert').textContent).toMatch(/invalid.*expired.*used/i);
    expect(screen.getByRole('link', { name: 'Request another link' }).getAttribute('href')).toBe(
      '/forgot-password'
    );
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it('blocks duplicate submission, then replaces the form with success and fresh sign-in', async () => {
    let done!: (value: { confirmation: string }) => void;
    const view = render(
      <ResetPasswordForm
        action={() =>
          new Promise((resolve) => {
            done = resolve;
          })
        }
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await screen.findByText('Saving password and ending sessions…');
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    done({ confirmation: 'Password changed. Sign in with your new password.' });
    await screen.findByText('Password changed. Sign in with your new password.');
    view.rerender(<ResetPasswordForm action={vi.fn()} invalidLink />);
    expect(screen.getByRole('status').textContent).toMatch(/Password changed/);
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('retains an actionable connection failure and offers retry', async () => {
    render(
      <ResetPasswordForm
        action={async () => {
          throw new TypeError('lost connection');
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/connection.*try again/i)
    );
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the saved-but-unrevoked warning visible after a same-password retry', async () => {
    const warning =
      'Your password was saved, but Admin sessions could not all be ended. The reset is incomplete.';
    let attempts = 0;
    render(
      <ResetPasswordForm
        action={async () => {
          attempts += 1;
          return attempts === 1
            ? { error: warning, revocationIncomplete: true }
            : { fieldErrors: { password: 'Use a different password.' } };
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await screen.findByText(warning);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Set new password' }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await screen.findByText('Use a different password.');
    expect(screen.getByText(warning)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });
});
