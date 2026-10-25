'use client';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FormField } from '@/components/shared/form-field';
import { FormFeedback } from '@/components/shared/form-feedback';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import styles from './profile.module.css';
import type { ProfileAction, ProfileData, ProfileState } from './state';

function ProfileForm({
  action,
  title,
  pendingText,
  children,
  showConfirmation = true,
  secondary = false,
}: {
  action: ProfileAction;
  title: string;
  pendingText: string;
  children?: (state: ProfileState, id: string, pending: boolean) => ReactNode;
  showConfirmation?: boolean;
  secondary?: boolean;
}) {
  const id = useId();
  const feedback = useRef<HTMLDivElement>(null);
  const [state, submit, pending] = useActionState<ProfileState, FormData>(
    async (previous, data) => {
      try {
        return await action(previous, data);
      } catch (error) {
        unstable_rethrow(error);
        return {
          error: 'Check your connection and try again. The last operation could not be confirmed.',
        };
      }
    },
    {}
  );
  useEffect(() => {
    feedback.current?.focus();
  }, [state]);
  return (
    <form
      className="grid min-w-0 content-start gap-4"
      action={submit}
      aria-busy={pending}
      noValidate
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {children?.(state, id, pending)}
      {state.error || state.fieldErrors ? (
        <FormFeedback kind="error" tabIndex={-1} feedbackRef={feedback}>
          {state.error ?? 'Correct the highlighted fields and try again.'}
        </FormFeedback>
      ) : null}
      {state.confirmation && showConfirmation ? (
        <FormFeedback kind="success" tabIndex={-1} feedbackRef={feedback}>
          {state.confirmation}
        </FormFeedback>
      ) : null}
      <Button
        type="submit"
        variant={secondary ? 'secondary' : 'default'}
        disabled={pending}
        className="w-full justify-self-start sm:w-auto"
      >
        {title}
      </Button>
      {pending ? (
        <p role="status" className="m-0 text-sm text-ds-text-muted">
          {pendingText}
        </p>
      ) : null}
    </form>
  );
}
function Field({
  label,
  name,
  id,
  state,
  value,
  onChange,
  password = false,
  disabled = false,
}: {
  label: string;
  name: string;
  id: string;
  state: ProfileState;
  value: string;
  onChange: (value: string) => void;
  password?: boolean;
  disabled?: boolean;
}) {
  return (
    <FormField
      id={`${id}-${name}`}
      label={label}
      help={password ? undefined : 'Optional. Include your country code.'}
      error={state.fieldErrors?.[name]}
    >
      {(a11y) => (
        <Input
          {...a11y}
          name={name}
          type={password ? 'password' : 'tel'}
          autoComplete={password ? 'new-password' : 'tel'}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          maxLength={password ? 128 : 40}
        />
      )}
    </FormField>
  );
}
export function Profile({
  initial,
  saveAction,
  passwordAction,
  signOutAction,
}: {
  initial: ProfileData;
  saveAction: ProfileAction;
  passwordAction: ProfileAction;
  signOutAction: ProfileAction;
}) {
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [theme, setTheme] = useState(initial.theme);
  const [savedPreferences, setSavedPreferences] = useState<{
    phone: string;
    theme: ProfileData['theme'];
  } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  return (
    <div className={styles.content}>
      <PageHeader title="Profile" description="Manage your account and how Admin pages appear." />
      <section aria-labelledby="preferences-heading" className={styles.section}>
        <div className={styles.sectionDescription}>
          <h2 className="m-0 mb-2 text-xl leading-7 font-semibold" id="preferences-heading">
            Account preferences
          </h2>
          <p className={styles.email}>
            <span className={styles.emailLabel}>Email</span>
            <br />
            {initial.email}
          </p>
        </div>
        <ProfileForm
          action={async (state, data) => {
            const result = await saveAction(state, data);
            if (result.confirmation) {
              setSavedPreferences({
                phone: String(data.get('phone') ?? ''),
                theme: data.get('theme') as ProfileData['theme'],
              });
            }
            return result;
          }}
          title="Save preferences"
          pendingText="Saving preferences…"
          showConfirmation={savedPreferences?.phone === phone && savedPreferences.theme === theme}
        >
          {(state, id, pending) => (
            <>
              <Field
                label="Phone number"
                name="phone"
                id={id}
                state={state}
                value={phone}
                onChange={setPhone}
                disabled={pending}
              />
              <FormField id={`${id}-theme`} label="Appearance" error={state.fieldErrors?.theme}>
                {(a11y) => (
                  <NativeSelect
                    {...a11y}
                    name="theme"
                    value={theme}
                    disabled={pending}
                    onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </NativeSelect>
                )}
              </FormField>
              <p className="m-0 text-sm text-ds-text-muted">
                Booth Mode keeps its own dark appearance.
              </p>
            </>
          )}
        </ProfileForm>
      </section>
      <section aria-labelledby="password-heading" className={styles.section}>
        <div className={styles.sectionDescription}>
          <h2 className="m-0 mb-2 text-xl leading-7 font-semibold" id="password-heading">
            Password
          </h2>
          <p className="m-0 text-base leading-[1.375rem] text-ds-text-muted">
            Use 12–128 characters for your new password.
          </p>
        </div>
        <ProfileForm
          action={async (state, data) => {
            const result = await passwordAction(state, data);
            if (result.confirmation) {
              setPassword('');
              setConfirmation('');
            }
            return result;
          }}
          title="Change password"
          pendingText="Changing password…"
        >
          {(state, id) => (
            <>
              <Field
                label="New password"
                name="password"
                id={id}
                state={state}
                value={password}
                onChange={setPassword}
                password
              />
              <Field
                label="Confirm new password"
                name="confirmation"
                id={id}
                state={state}
                value={confirmation}
                onChange={setConfirmation}
                password
              />
            </>
          )}
        </ProfileForm>
      </section>
      <section aria-labelledby="session-heading" className={styles.section}>
        <div className={styles.sectionDescription}>
          <h2 className="m-0 mb-2 text-xl leading-7 font-semibold" id="session-heading">
            This device
          </h2>
          <p className="m-0 text-base leading-[1.375rem] text-ds-text-muted">
            Sign out of Admin on this device. Your other devices stay signed in.
          </p>
        </div>
        <ProfileForm action={signOutAction} title="Sign out" pendingText="Signing out…" secondary />
      </section>
    </div>
  );
}
