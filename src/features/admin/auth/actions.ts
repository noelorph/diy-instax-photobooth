'use server';

import { redirect, unstable_rethrow } from 'next/navigation';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { connectionError, type AuthFormState } from './state';
import { recoveryCallbackUrl } from './config';

const credentialError = 'Email or password is incorrect. Check your details and try again.';

function emailFrom(data: FormData) {
  const value = data.get('email');
  return typeof value === 'string' ? value.trim() : '';
}

function emailError(email: string) {
  return email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? 'Enter a valid email address.'
    : undefined;
}

export async function signIn(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = emailFrom(formData);
  const rawPassword = formData.get('password');
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  const fieldErrors = {
    email: emailError(email),
    password: password ? undefined : 'Enter your password.',
  };
  if (fieldErrors.email || fieldErrors.password) return { email, fieldErrors };

  let client: Awaited<ReturnType<typeof createClient>> | undefined;
  let authenticated = false;
  try {
    client = await createClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return {
        email,
        error: error && (!error.status || error.status >= 500) ? connectionError : credentialError,
      };
    }
    authenticated = true;
    // This SELECT applies the same allowlist + active-session RLS as requireAdmin.
    const { data: profile, error: profileError } = await client
      .from('admin_profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError || !profile) {
      const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
      return { email, error: profileError || signOutError ? connectionError : credentialError };
    }
  } catch {
    if (authenticated && client) {
      // A failed authorization lookup must not become a successful sign-in.
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        /* Protected boundaries still fail closed. */
      }
    }
    return { email, error: connectionError };
  }
  // Next.js redirect is control flow; keep it outside the failure handler.
  redirect('/dashboard');
}

export async function requestRecovery(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = emailFrom(formData);
  const invalidEmail = emailError(email);
  if (invalidEmail) return { email, fieldErrors: { email: invalidEmail } };
  const failure = {
    email,
    error: 'Unable to send a recovery link. Check your connection and try again.',
  };
  let client: Awaited<ReturnType<typeof createClient>>;
  let redirectTo: string;
  try {
    redirectTo = recoveryCallbackUrl();
    client = await createClient();
  } catch (error) {
    unstable_rethrow(error);
    return failure;
  }
  let authFailure: unknown;
  try {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    authFailure = error;
  } catch (error) {
    unstable_rethrow(error);
    authFailure = error;
  }
  // A known address can hit cooldown or delivery errors while an unknown one
  // succeeds. Even HTTP 500 becomes AuthRetryableFetchError in the SDK; only
  // status 0 identifies connection loss independent of account existence.
  if (isAuthRetryableFetchError(authFailure) && authFailure.status === 0) return failure;
  return {
    email,
    confirmation:
      'Check your email. If recovery is available for this address, a link may arrive shortly. If it does not arrive, wait a minute and try again.',
  };
}
