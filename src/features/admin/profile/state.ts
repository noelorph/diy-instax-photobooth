export type ProfileState = {
  confirmation?: string;
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
};
export type ProfileAction = (state: ProfileState, data: FormData) => Promise<ProfileState>;
export type ProfileData = { email: string; phone: string | null; theme: 'light' | 'dark' };
