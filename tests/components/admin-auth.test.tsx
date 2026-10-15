import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { RecoveryRequestForm, SignInForm } from '@/features/admin/auth/forms';
import type { AuthFormState } from '@/features/admin/auth/state';

afterEach(cleanup);

class NavigationBoundary extends Component<{ children: ReactNode }, { leaving: boolean }> {
  state = { leaving: false };
  static getDerivedStateFromError() {
    return { leaving: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.leaving ? <p>Leaving sign-in</p> : this.props.children;
  }
}

describe('Public Admin sign-in form', () => {
  it('offers labeled credentials and recovery without signup or protected navigation', () => {
    render(<SignInForm action={async () => ({ email: '' })} />);
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(email.type).toBe('email');
    expect(email.autocomplete).toBe('email');
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password'
    );
    expect(
      screen.queryByRole('link', { name: /sign up|dashboard|events|history|profile/i })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /sign up/i })).toBeNull();
  });

  it('associates persistent field errors with inputs and preserves email for retry', async () => {
    render(
      <SignInForm
        action={async (_, data) => ({
          email: String(data.get('email')),
          fieldErrors: { email: 'Enter a valid email address.', password: 'Enter your password.' },
        })}
      />
    );
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'invalid' } });
    fireEvent.submit(email.form!);
    await screen.findByText('Enter a valid email address.');
    for (const label of ['Email', 'Password']) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(
        document.getElementById(input.getAttribute('aria-describedby')!)?.textContent
      ).toBeTruthy();
    }
    expect(email.value).toBe('invalid');
    expect(screen.getByRole('alert').textContent).toMatch(/correct/i);
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('keeps neutral credential feedback visible through editing and allows retry', async () => {
    let attempts = 0;
    render(
      <SignInForm
        action={async (_, data) => {
          attempts++;
          return {
            email: String(data.get('email')),
            error: 'Email or password is incorrect. Check your details and try again.',
          };
        }}
      />
    );
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'owner@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    fireEvent.change(email, { target: { value: 'corrected@example.test' } });
    expect(screen.getByRole('alert').textContent).toMatch(/try again/i);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(email.value).toBe('corrected@example.test');
  });

  it('blocks duplicate submissions while pending and announces the wait', async () => {
    let finish!: (state: AuthFormState) => void;
    let attempts = 0;
    render(
      <SignInForm
        action={async () => {
          attempts++;
          return new Promise((resolve) => {
            finish = resolve;
          });
        }}
      />
    );
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'owner@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
        true
      )
    );
    expect(screen.getByRole('status').textContent).toMatch(/signing in/i);
    fireEvent.submit(email.form!);
    await act(async () => finish({ email: 'owner@example.test', error: 'Try again.' }));
    expect(attempts).toBe(1);
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('turns a lost action connection into persistent feedback with preserved email and retry', async () => {
    render(
      <SignInForm
        action={async () => {
          throw new TypeError('Failed to fetch');
        }}
      />
    );
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'owner@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/connection.*try again/i);
    expect(email.value).toBe('owner@example.test');
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('lets a successful action redirect reach the navigation boundary', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <NavigationBoundary>
        <SignInForm action={async () => redirect('/dashboard')} />
      </NavigationBoundary>
    );
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'owner@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Leaving sign-in');
    expect(screen.queryByRole('alert')).toBeNull();
    diagnostic.mockRestore();
  });
});

describe('Public recovery request form', () => {
  it('offers a labeled email and return to sign-in without protected navigation', () => {
    render(<RecoveryRequestForm action={async () => ({ email: '' })} />);
    expect((screen.getByLabelText('Email') as HTMLInputElement).type).toBe('email');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Send recovery link' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe(
      '/sign-in'
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('renders persistent neutral confirmation with an explicit retry and preserved email', async () => {
    let attempts = 0;
    render(
      <RecoveryRequestForm
        action={async (_, data) => {
          attempts++;
          return {
            email: String(data.get('email')),
            confirmation:
              'Check your email. If recovery is available for this address, a link may arrive shortly. If it does not arrive, wait a minute and try again.',
          };
        }}
      />
    );
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'owner@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/check your email/i)
    );
    expect(email.value).toBe('owner@example.test');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(email.value).toBe('owner@example.test');
  });

  it('retains a failed request and offers an explicit retry', async () => {
    let attempts = 0;
    render(
      <RecoveryRequestForm
        action={async (_, data) => {
          attempts++;
          return {
            email: String(data.get('email')),
            error: 'Unable to send a recovery link. Please try again.',
          };
        }}
      />
    );
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'owner@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/try again/i);
    expect(email.value).toBe('owner@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(attempts).toBe(2));
  });
});
