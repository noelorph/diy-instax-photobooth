import { z } from 'zod';

const passwordConfirmationSchema = z
  .object({
    password: z
      .string({ error: 'Enter a password.' })
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Use no more than 128 characters.'),
    confirmation: z.string({ error: 'The passwords must match.' }),
  })
  .superRefine(({ password, confirmation }, context) => {
    if (password !== confirmation) {
      context.addIssue({
        code: 'custom',
        path: ['confirmation'],
        message: 'The passwords must match.',
      });
    }
  });

type PasswordConfirmation = z.output<typeof passwordConfirmationSchema>;
type PasswordFieldErrors = Partial<Record<keyof PasswordConfirmation, string>>;

export function validatePasswordConfirmation(
  password: unknown,
  confirmation: unknown
):
  | { success: true; data: PasswordConfirmation }
  | { success: false; fieldErrors: PasswordFieldErrors } {
  const result = passwordConfirmationSchema.safeParse({ password, confirmation });
  if (result.success) return result;

  const fieldErrors: PasswordFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if ((field === 'password' || field === 'confirmation') && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
