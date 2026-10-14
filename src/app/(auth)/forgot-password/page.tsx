import { requestRecovery } from '@/features/admin/auth/actions';
import { RecoveryRequestForm } from '@/features/admin/auth/forms';

export default function ForgotPasswordPage() {
  return (
    <>
      <h1>Forgot password?</h1>
      <p>Enter your email to request a recovery link.</p>
      <RecoveryRequestForm action={requestRecovery} />
    </>
  );
}
