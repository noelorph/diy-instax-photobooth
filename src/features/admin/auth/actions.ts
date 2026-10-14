'use server';

import { redirect } from 'next/navigation';
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
  try {
    const redirectTo = recoveryCallbackUrl();
    const client = await createClient();
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { email, error: 'Unable to send a recovery link. Please try again.' };
  } catch {
    return { email, error: 'Unable to send a recovery link. Check your connection and try again.' };
  }
  return {
    email,
    confirmation:
      'Check your email. If this address has an account, a recovery link will arrive shortly.',
  };
}
