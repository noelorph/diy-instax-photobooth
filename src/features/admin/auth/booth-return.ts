import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
export const boothReturnCookie = '__Host-booth-return';
/** This hint is navigation only. The signed-in session must independently authorize the Event. */
export async function consumeBoothReturn(authorize: (id: string) => Promise<boolean>) {
  const store = await cookies();
  const id = store.get(boothReturnCookie)?.value;
  if (!id) return '/dashboard';
  store.set(boothReturnCookie, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  if (!z.uuid().safeParse(id).success) return '/dashboard';
  return (await authorize(id)) ? `/events/${id}` : '/dashboard';
}
