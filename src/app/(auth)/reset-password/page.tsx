import styles from '@/components/layout/auth-frame.module.css';
import { Suspense } from 'react';
import { FormFeedback } from '@/components/shared/form-feedback';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { recoverySession } from '@/features/admin/auth/recovery-session';
import { resetPassword } from '@/features/admin/auth/reset-action';
import { ResetPasswordForm } from '@/features/admin/auth/reset-form';

type Props = { searchParams: Promise<{ error?: string }> };
async function Recovery({ searchParams }: Props) {
  const params = await searchParams;
  let valid = false;
  try {
    valid = !params.error && (await recoverySession(await createClient()));
  } catch (error) {
    unstable_rethrow(error);
  }
  return <ResetPasswordForm action={resetPassword} invalidLink={!valid} />;
}
export default function ResetPasswordPage(props: Props) {
  return (
    <>
      <h1 className={styles.heading}>Set a new password</h1>
      <Suspense fallback={<FormFeedback kind="status">Checking recovery link…</FormFeedback>}>
        <Recovery {...props} />
      </Suspense>
    </>
  );
}
