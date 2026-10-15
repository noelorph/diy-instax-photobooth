'use client';

import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useId, useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { FormFeedback } from '@/components/shared/form-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      className="public-auth-form"
      aria-busy={pending}
    >
      <FormField id={`${id}-email`} label="Email" error={state.fieldErrors?.email}>
        {(a11y) => (
          <Input
            {...a11y}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        )}
      </FormField>
      {signIn ? (
        <FormField id={`${id}-password`} label="Password" error={state.fieldErrors?.password}>
          {(a11y) => (
            <Input
              {...a11y}
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </FormField>
      ) : null}
      {state.fieldErrors ? (
        <FormFeedback kind="error">Correct the highlighted fields and try again.</FormFeedback>
      ) : null}
      {state.error ? <FormFeedback kind="error">{state.error}</FormFeedback> : null}
      {state.confirmation ? <FormFeedback kind="success">{state.confirmation}</FormFeedback> : null}
      <Button type="submit" disabled={pending}>
        {signIn
          ? 'Sign in'
          : state.error || state.confirmation
            ? 'Try again'
            : 'Send recovery link'}
      </Button>
      {pending ? (
        <FormFeedback kind="status">
          {signIn ? 'Signing in…' : 'Sending recovery link…'}
        </FormFeedback>
      ) : null}
      {signIn ? (
        <Link href="/forgot-password">Forgot password?</Link>
      ) : (
        <Link href="/sign-in">Back to sign in</Link>
      )}
    </form>
  );
}
