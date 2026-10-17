'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import type { ProfileState } from './state';
import { validatePasswordConfirmation } from '../password-schema';

export async function saveProfile(_state: ProfileState, data: FormData): Promise<ProfileState> {
  try {
    const { userId } = await requireAdmin();
    const phone = String(data.get('phone') ?? '').trim();
    const theme = data.get('theme');
    const fieldErrors = {
      phone:
        phone &&
        (!/^[+\d\s().-]+$/.test(phone) ||
          phone.replace(/\D/g, '').length < 7 ||
          phone.replace(/\D/g, '').length > 15 ||
          phone.length > 40)
          ? 'Enter a valid phone number, or leave it blank.'
          : undefined,
      theme: theme !== 'light' && theme !== 'dark' ? 'Choose light or dark.' : undefined,
    };
    if (fieldErrors.phone || fieldErrors.theme) return { fieldErrors };
    const client = await createClient();
    const { data: saved, error } = await client
      .from('admin_profiles')
      .update({ phone: phone || null, theme })
      .eq('id', userId)
      .select('id')
      .maybeSingle();
    if (error || !saved)
      return { error: 'Preferences could not be saved. Check your connection and try again.' };
    revalidatePath('/(admin)', 'layout');
    return { confirmation: 'Preferences saved.' };
  } catch (error) {
    unstable_rethrow(error);
    return { error: 'Preferences could not be saved. Check your connection and try again.' };
  }
}

export async function changePassword(_state: ProfileState, data: FormData): Promise<ProfileState> {
  try {
    await requireAdmin();
    const validation = validatePasswordConfirmation(data.get('password'), data.get('confirmation'));
    if (!validation.success) return { fieldErrors: validation.fieldErrors };
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password: validation.data.password });
    if (error)
      return {
        error:
          'Password could not be changed. Use a different secure password or check your connection and try again.',
      };
    return { confirmation: 'Password changed. Use your new password the next time you sign in.' };
  } catch (error) {
    unstable_rethrow(error);
    return { error: 'Password could not be changed. Check your connection and try again.' };
  }
}

export async function signOut(_state: ProfileState, _data: FormData): Promise<ProfileState> {
  void _state;
  void _data;
  let client;
  try {
    client = await createClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) redirect('/sign-in');
    // Keep the local cookie for a retry if Auth does not confirm revocation.
    // The high-level signOut clears it even when the remote call fails.
    const { error } = await client.auth.admin.signOut(sessionData.session.access_token, 'local');
    if (!error) {
      await client.auth.signOut({ scope: 'local' });
      redirect('/sign-in');
    }
  } catch (error) {
    unstable_rethrow(error);
  }
  // A lost response may follow successful revocation. Check the actual RLS
  // boundary before describing the session as active or ended.
  try {
    if (client) {
      const { data, error } = await client.from('admin_profiles').select('id');
      if (!error && !data?.length) {
        try {
          await client.auth.signOut({ scope: 'local' });
        } catch (cleanupError) {
          unstable_rethrow(cleanupError);
        }
        redirect('/sign-in');
      }
      if (!error)
        return {
          error:
            'You are still signed in on this device. Sign out failed; check your connection and try again.',
        };
    }
  } catch (error) {
    unstable_rethrow(error);
  }
  return {
    error:
      'Unable to confirm whether sign out finished. Check your connection and try again before leaving this device.',
  };
}
