'use server';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { recoverySession } from './recovery-session';
import { invalidRecoveryLink, type ResetState } from './reset-state';

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
    const { error } = await client.auth.updateUser({ password: password as string });
    // If global sign-out failed after the save, submitting the same password
    // again must still allow revocation to finish. Never trust previous form state.
    if (error && error.code !== 'same_password') {
      return {
        error:
          'Unable to save this password. Use a different secure password or check your connection and try again.',
      };
    }
    saved = true;
    if ((await client.auth.signOut({ scope: 'global' })).error) {
      return {
        error:
          'Your password is saved, but ending all sessions failed. Submit the same password again to finish the reset.',
      };
    }
    return {
      confirmation:
        'Password changed. All Admin sessions have ended. Sign in with your new password.',
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      error: saved
        ? 'Your password is saved, but ending all sessions failed. Submit the same password again to finish the reset.'
        : 'The reset could not be completed. Check your connection and try again.',
    };
  }
}
