export type AuthFormState = {
  email: string;
  fieldErrors?: { email?: string; password?: string };
  error?: string;
  confirmation?: string;
};

export type AuthFormAction = (state: AuthFormState, data: FormData) => Promise<AuthFormState>;

export const connectionError = 'Check your connection and try again.';
