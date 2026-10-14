import { Suspense } from 'react';
import { signIn } from '@/features/admin/auth/actions';
import { SignInForm } from '@/features/admin/auth/forms';

type Props = { searchParams: Promise<{ reason?: string | string[] }> };

async function SessionFeedback({ searchParams }: Props) {
  const { reason } = await searchParams;
  return reason === 'session-ended' ? (
    <p role="status">Your session is no longer available. Sign in again to continue.</p>
  ) : null;
}

export default function SignInPage(props: Props) {
  return (
    <>
      <h1>Sign in</h1>
      <p>Sign in to your Admin account.</p>
      <Suspense fallback={null}>
        <SessionFeedback {...props} />
      </Suspense>
      <SignInForm action={signIn} />
    </>
  );
}
