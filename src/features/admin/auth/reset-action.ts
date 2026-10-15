'use server';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { recoverySession } from './recovery-session';
import { invalidRecoveryLink, type ResetState } from './reset-state';
import { validatePasswordConfirmation } from '../password-schema';

const incompleteReset =
  'Your password was saved, but Admin sessions could not all be ended. The reset is incomplete. Enter a different password and submit again to retry.';
const uncertainReset =
  'Your password was saved, but we could not confirm whether all Admin sessions ended. Request another recovery link to finish the reset.';

export async function resetPassword(_state: ResetState, data: FormData): Promise<ResetState> {
  const validation = validatePasswordConfirmation(data.get('password'), data.get('confirmation'));
  if (!validation.success) return { fieldErrors: validation.fieldErrors };
  const { password } = validation.data;
  let saved = false;
  try {
    const client = await createClient();
    if (!(await recoverySession(client))) return { invalidLink: true, error: invalidRecoveryLink };
    // Authorization was verified above; the stored session supplies only the JWT
    // needed by Auth's token-scoped global revocation endpoint.
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session)
      return { invalidLink: true, error: invalidRecoveryLink };
    const { error } = await client.auth.updateUser({ password });
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
    let revocationConfirmed = false;
    try {
      revocationConfirmed = !(
        await client.auth.admin.signOut(sessionData.session.access_token, 'global')
      ).error;
    } catch (error) {
      unstable_rethrow(error);
    }
    if (!revocationConfirmed) {
      // The Auth response can be lost after revocation commits. The live-session
      // RLS boundary distinguishes a confirmed-active recovery session from one
      // that can no longer submit a different password.
      try {
        const { data: profile, error } = await client.from('admin_profiles').select('id');
        if (!error && profile?.length)
          return { error: incompleteReset, revocationIncomplete: true };
      } catch (error) {
        unstable_rethrow(error);
      }
      return { error: uncertainReset, requiresNewLink: true };
    }
    // Remote global revocation is confirmed; now clear this browser's cookie.
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch (error) {
      unstable_rethrow(error);
      // The recovery session is already revoked; another password cannot retry cleanup.
    }
    return {
      confirmation:
        'Password changed. All Admin sessions have ended. Sign in with your new password.',
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: saved
        ? uncertainReset
        : 'The reset could not be completed. Check your connection and try again.',
      requiresNewLink: saved,
    };
  }
}
