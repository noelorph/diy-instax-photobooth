export type ResetState = {
  fieldErrors?: { password?: string; confirmation?: string };
  error?: string;
  revocationIncomplete?: boolean;
  invalidLink?: boolean;
  confirmation?: string;
};
export type ResetAction = (state: ResetState, data: FormData) => Promise<ResetState>;
export const invalidRecoveryLink =
  'This recovery link is invalid, expired, or already used. Request another link in this browser.';
