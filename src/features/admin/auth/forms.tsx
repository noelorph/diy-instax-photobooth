'use client';

import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useId, useState } from 'react';
import { connectionError, type AuthFormAction, type AuthFormState } from './state';

export function SignInForm({ action }: { action: AuthFormAction }) {
  return <PublicAuthForm action={action} signIn />;
}

export function RecoveryRequestForm({ action }: { action: AuthFormAction }) {
  return <PublicAuthForm action={action} signIn={false} />;
}

function PublicAuthForm({ action, signIn }: { action: AuthFormAction; signIn: boolean }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    async (previous, data) => {
      try {
        return await action(previous, data);
      } catch (error) {
        unstable_rethrow(error);
        return { email: String(data.get('email') ?? ''), error: connectionError };
      }
    },
    { email: '' }
  );

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="auth-form"
      aria-busy={pending}
    >
      <div className="auth-field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? `${id}-email-error` : undefined}
        />
        {state.fieldErrors?.email ? (
          <p id={`${id}-email-error`} className="auth-field-error">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>
      {signIn ? (
        <div className="auth-field">
          <label htmlFor={`${id}-password`}>Password</label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
            aria-describedby={state.fieldErrors?.password ? `${id}-password-error` : undefined}
          />
          {state.fieldErrors?.password ? (
            <p id={`${id}-password-error`} className="auth-field-error">
              {state.fieldErrors.password}
            </p>
          ) : null}
        </div>
      ) : null}
      {state.fieldErrors ? (
        <p role="alert" className="auth-alert">
          Correct the highlighted fields and try again.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="auth-alert">
          {state.error}
        </p>
      ) : null}
      {state.confirmation ? (
        <p role="status" className="auth-confirmation">
          {state.confirmation}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {signIn ? 'Sign in' : state.error ? 'Try again' : 'Send recovery link'}
      </button>
      {pending ? <p role="status">{signIn ? 'Signing in…' : 'Sending recovery link…'}</p> : null}
      {signIn ? (
        <Link href="/forgot-password">Forgot password?</Link>
      ) : (
        <Link href="/sign-in">Back to sign in</Link>
      )}
    </form>
  );
}
