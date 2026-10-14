'use server';
import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import type { ProfileState } from './state';

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
    const password = data.get('password');
    const fieldErrors = {
      password:
        typeof password !== 'string' || password.length < 12 || password.length > 128
          ? 'Use 12–128 characters.'
          : undefined,
      confirmation: password !== data.get('confirmation') ? 'The passwords must match.' : undefined,
    };
    if (fieldErrors.password || fieldErrors.confirmation) return { fieldErrors };
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password: password as string });
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
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (!error) redirect('/sign-in');
  } catch (error) {
    unstable_rethrow(error);
  }
  // A lost response may follow successful revocation. Check the actual RLS
  // boundary before describing the session as active or ended.
  try {
    if (client) {
      const session = await client.auth.getSession();
      if (!session.error && !session.data.session) redirect('/sign-in');
      const { data, error } = await client.from('admin_profiles').select('id');
      if (!error && !data?.length) redirect('/sign-in');
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
