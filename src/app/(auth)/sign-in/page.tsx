import { signIn } from '@/features/admin/auth/actions';
import { SignInForm } from '@/features/admin/auth/forms';

export default function SignInPage() {
  return (
    <>
      <h1>Sign in</h1>
      <p>Sign in to your Admin account.</p>
      <SignInForm action={signIn} />
    </>
  );
}
