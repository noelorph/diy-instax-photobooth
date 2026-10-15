import { describe, expect, it } from 'vitest';
import { validatePasswordConfirmation } from '@/features/admin/password-schema';

describe('Admin password validation', () => {
  it('accepts matching passwords from 12 through 128 characters', () => {
    expect(validatePasswordConfirmation('a'.repeat(12), 'a'.repeat(12))).toEqual({
      success: true,
      data: { password: 'a'.repeat(12), confirmation: 'a'.repeat(12) },
    });
    expect(validatePasswordConfirmation('a'.repeat(128), 'a'.repeat(128)).success).toBe(true);
  });

  it('reports password length and confirmation errors on their fields', () => {
    expect(validatePasswordConfirmation('short', 'different')).toEqual({
      success: false,
      fieldErrors: {
        password: 'Use at least 12 characters.',
        confirmation: 'The passwords must match.',
      },
    });
    expect(validatePasswordConfirmation('a'.repeat(129), 'a'.repeat(129))).toEqual({
      success: false,
      fieldErrors: { password: 'Use no more than 128 characters.' },
    });
  });

  it('rejects non-string form values without exposing them', () => {
    const result = validatePasswordConfirmation(new File(['secret'], 'password.txt'), 'secret');
    expect(result).toEqual({
      success: false,
      fieldErrors: { password: 'Enter a password.' },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
