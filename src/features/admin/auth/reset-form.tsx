'use client';
import Link from 'next/link';
import styles from './auth-form.module.css';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { FormFeedback } from '@/components/shared/form-feedback';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/shared/password-input';
import { invalidRecoveryLink, type ResetAction, type ResetState } from './reset-state';

export function ResetPasswordForm({
  action,
  invalidLink = false,
}: {
  action: ResetAction;
  invalidLink?: boolean;
}) {
  const id = useId();
  const feedback = useRef<HTMLDivElement>(null);
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
      <div className={styles.form}>
        <FormFeedback kind="success" tabIndex={-1} feedbackRef={feedback}>
          {state.confirmation}
        </FormFeedback>
        <Link className={styles.link} href="/sign-in">
          Sign in
        </Link>
      </div>
    );
  if (invalidLink || state.invalidLink)
    return (
      <div className={styles.form}>
        <FormFeedback kind="error" tabIndex={-1} feedbackRef={feedback}>
          {invalidRecoveryLink}
        </FormFeedback>
        <Link className={styles.link} href="/forgot-password">
          Request another link
        </Link>
        <Link className={styles.link} href="/sign-in">
          Back to sign in
        </Link>
      </div>
    );
  if (state.requiresNewLink)
    return (
      <div className={styles.form}>
        <FormFeedback kind="error" tabIndex={-1} feedbackRef={feedback}>
          {state.error}
        </FormFeedback>
        <Link className={styles.link} href="/forgot-password">
          Request another link
        </Link>
      </div>
    );
  return (
    <form
      action={formAction}
      noValidate
      className={styles.form}
      aria-busy={pending}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {(['password', 'confirmation'] as const).map((field) => (
        <FormField
          key={field}
          id={`${id}-${field}`}
          label={field === 'password' ? 'New password' : 'Confirm new password'}
          help="Use 12–128 characters. After saving, sign in again on each Admin device."
          error={state.fieldErrors?.[field]}
        >
          {(a11y) => (
            <PasswordInput
              {...a11y}
              label={field === 'password' ? 'New password' : 'Confirm new password'}
              name={field}
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={field === 'password' ? password : confirmation}
              onChange={(event) =>
                (field === 'password' ? setPassword : setConfirmation)(event.target.value)
              }
            />
          )}
        </FormField>
      ))}
      {revocationWarning && !state.revocationIncomplete ? (
        <FormFeedback kind="status">{revocationWarning}</FormFeedback>
      ) : null}
      {state.fieldErrors || state.error ? (
        <FormFeedback kind="error" tabIndex={-1} feedbackRef={feedback}>
          {state.error ?? 'Correct the highlighted fields and try again.'}
        </FormFeedback>
      ) : null}
      <Button type="submit" disabled={pending}>
        Set new password
      </Button>
      {pending ? (
        <FormFeedback kind="status">Saving password and ending sessions…</FormFeedback>
      ) : null}
      <Link className={styles.link} href="/forgot-password">
        Request another link
      </Link>
    </form>
  );
}
