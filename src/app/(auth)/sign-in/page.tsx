import styles from '@/components/layout/auth-frame.module.css';
import { Suspense } from 'react';
import { FormFeedback } from '@/components/shared/form-feedback';
import { signIn } from '@/features/admin/auth/actions';
import { SignInForm } from '@/features/admin/auth/forms';

type Props = { searchParams: Promise<{ reason?: string | string[]; from?: string | string[] }> };

async function SessionFeedback({ searchParams }: Props) {
  const { reason } = await searchParams;
  return reason === 'session-ended' ? (
    <FormFeedback kind="status">
      Your session is no longer available. Sign in again to continue.
    </FormFeedback>
  ) : null;
}

async function SignInContent(props: Props) {
  const { from } = await props.searchParams;
  return (
    <div data-booth-return={from === 'booth' ? 'true' : undefined}>
      <h1 className={styles.heading}>Sign in</h1>
      <p className={styles.description}>
        {from === 'booth'
          ? 'Sign in to review the Event. Resuming Booth Mode requires an explicit Admin action.'
          : 'Manage your events and booth.'}
      </p>
      <SessionFeedback {...props} />
      <SignInForm action={signIn} />
    </div>
  );
}
export default function SignInPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <SignInContent {...props} />
    </Suspense>
  );
}
