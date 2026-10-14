'use client';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { invalidRecoveryLink, type ResetAction, type ResetState } from './reset-state';

export function ResetPasswordForm({
  action,
  invalidLink = false,
}: {
  action: ResetAction;
  invalidLink?: boolean;
}) {
  const id = useId();
  const feedback = useRef<HTMLParagraphElement>(null);
  const [revocationWarning, setRevocationWarning] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    async (previous, data) => {
      try {
        const next = await action(previous, data);
        if (next.revocationIncomplete && next.error) setRevocationWarning(next.error);
        if (next.confirmation) setRevocationWarning(null);
        return next;
      } catch (error) {
        unstable_rethrow(error);
        return { error: 'Check your connection and try again.' };
      }
    },
    {}
  );
  useEffect(() => {
    if (state.error || state.fieldErrors || state.confirmation) feedback.current?.focus();
  }, [state]);
  if (state.confirmation)
    return (
      <div className="auth-form">
        <p role="status" className="auth-confirmation" tabIndex={-1} ref={feedback}>
          {state.confirmation}
        </p>
        <Link href="/sign-in">Sign in</Link>
      </div>
    );
  if (invalidLink || state.invalidLink)
    return (
      <div className="auth-form">
        <p className="auth-alert" role="alert" tabIndex={-1} ref={feedback}>
          {invalidRecoveryLink}
        </p>
        <Link href="/forgot-password">Request another link</Link>
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    );
  if (state.requiresNewLink)
    return (
      <div className="auth-form">
        <p className="auth-alert" role="alert" tabIndex={-1} ref={feedback}>
          {state.error}
        </p>
        <Link href="/forgot-password">Request another link</Link>
      </div>
    );
  return (
    <form
      action={formAction}
      noValidate
      className="auth-form"
      aria-busy={pending}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <p id={`${id}-help`}>
        Use 12–128 characters. After saving, sign in again on each Admin device.
      </p>
      {(['password', 'confirmation'] as const).map((field) => (
        <div key={field} className="auth-field">
          <label htmlFor={`${id}-${field}`}>
            {field === 'password' ? 'New password' : 'Confirm new password'}
          </label>
          <input
            id={`${id}-${field}`}
            name={field}
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={field === 'password' ? password : confirmation}
            onChange={(event) =>
              (field === 'password' ? setPassword : setConfirmation)(event.target.value)
            }
            aria-invalid={Boolean(state.fieldErrors?.[field])}
            aria-describedby={state.fieldErrors?.[field] ? `${id}-${field}-error` : `${id}-help`}
          />
          {state.fieldErrors?.[field] ? (
            <p id={`${id}-${field}-error`} className="auth-field-error">
              {state.fieldErrors[field]}
            </p>
          ) : null}
        </div>
      ))}
      {revocationWarning && !state.revocationIncomplete ? (
        <p role="status" className="auth-alert">
          {revocationWarning}
        </p>
      ) : null}
      {state.fieldErrors || state.error ? (
        <p role="alert" className="auth-alert" tabIndex={-1} ref={feedback}>
          {state.error ?? 'Correct the highlighted fields and try again.'}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        Set new password
      </button>
      {pending ? <p role="status">Saving password and ending sessions…</p> : null}
      <Link href="/forgot-password">Request another link</Link>
    </form>
  );
}
