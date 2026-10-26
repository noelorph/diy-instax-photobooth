import styles from '@/components/layout/auth-frame.module.css';
import { requestRecovery } from '@/features/admin/auth/actions';
import { RecoveryRequestForm } from '@/features/admin/auth/forms';

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className={styles.heading}>Forgot password?</h1>
      <p className={styles.description}>Enter your email to receive a recovery link.</p>
      <RecoveryRequestForm action={requestRecovery} />
    </>
  );
}
