'use server';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { recoverySession } from './recovery-session';
import { invalidRecoveryLink, type ResetState } from './reset-state';

const incompleteReset =
  'Your password was saved, but Admin sessions could not all be ended. The reset is incomplete. Enter a different password and submit again to retry.';

export async function resetPassword(_state: ResetState, data: FormData): Promise<ResetState> {
  const password = data.get('password');
  const confirmation = data.get('confirmation');
  const fieldErrors = {
    password:
      typeof password !== 'string' || password.length < 12
        ? 'Use at least 12 characters.'
        : password.length > 128
          ? 'Use no more than 128 characters.'
          : undefined,
    confirmation: password !== confirmation ? 'The passwords must match.' : undefined,
  };
  if (fieldErrors.password || fieldErrors.confirmation) return { fieldErrors };
  let saved = false;
  try {
    const client = await createClient();
    if (!(await recoverySession(client))) return { invalidLink: true, error: invalidRecoveryLink };
    // Authorization was verified above; the stored session supplies only the JWT
    // needed by Auth's token-scoped global revocation endpoint.
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session)
      return { invalidLink: true, error: invalidRecoveryLink };
    const { error } = await client.auth.updateUser({ password: password as string });
    if (error?.code === 'same_password') {
      return { fieldErrors: { password: 'Use a different password from the one currently set.' } };
    }
    if (error) {
      return {
        error:
          'Unable to save this password. Use a different secure password or check your connection and try again.',
      };
    }
    saved = true;
    // The high-level global signOut clears the recovery cookie even when
    // remote revocation fails, leaving no session for a different-password retry.
    if ((await client.auth.admin.signOut(sessionData.session.access_token, 'global')).error) {
      return { error: incompleteReset, revocationIncomplete: true };
    }
    // Remote global revocation is confirmed; now clear this browser's cookie.
    await client.auth.signOut({ scope: 'local' });
    return {
      confirmation:
        'Password changed. All Admin sessions have ended. Sign in with your new password.',
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: saved
        ? incompleteReset
        : 'The reset could not be completed. Check your connection and try again.',
      revocationIncomplete: saved,
    };
  }
}
