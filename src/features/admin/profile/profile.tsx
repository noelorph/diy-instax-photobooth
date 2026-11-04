'use client';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FormField } from '@/components/shared/form-field';
import { FormFeedback } from '@/components/shared/form-feedback';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Camera, Moon, Sun } from 'lucide-react';
import { PasswordInput } from '@/components/shared/password-input';
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
      {(a11y) => {
        const Control = password ? PasswordInput : Input;
        return (
          <Control
            label={label}
            {...a11y}
            name={name}
            {...(password ? {} : { type: 'tel' })}
            autoComplete={password ? 'new-password' : 'tel'}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            maxLength={password ? 128 : 40}
          />
        );
      }}
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
            <section aria-labelledby="account-heading" className={styles.section}>
              <h2 id="account-heading" className={styles.heading}>
                Account
              </h2>
              <div className={styles.fields}>
                <FormField id={`${id}-email`} label="Email (Admin)">
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="email"
                      value={initial.email}
                      readOnly
                      className="bg-ds-surface-muted"
                    />
                  )}
                </FormField>
                <Field
                  label="Phone number"
                  name="phone"
                  id={id}
                  state={state}
                  value={phone}
                  onChange={setPhone}
                  disabled={pending}
                />
              </div>
            </section>
            <section
              aria-labelledby="appearance-heading"
              className={`${styles.section} ${styles.appearance}`}
            >
              <div>
                <h2 id="appearance-heading" className={styles.heading}>
                  Appearance
                </h2>
                <p className={styles.description}>Choose the appearance of Admin pages.</p>
                <fieldset
                  className={styles.choices}
                  disabled={pending}
                  role="radiogroup"
                  aria-labelledby={`${id}-theme-label`}
                  aria-invalid={!!state.fieldErrors?.theme}
                  aria-describedby={state.fieldErrors?.theme ? `${id}-theme-error` : undefined}
                >
                  <legend id={`${id}-theme-label`} className="sr-only">
                    Admin appearance
                  </legend>
                  {(['light', 'dark'] as const).map((choice) => {
                    const Icon = choice === 'light' ? Sun : Moon;
                    return (
                      <label key={choice} className={styles.choice}>
                        <input
                          type="radio"
                          disabled={pending}
                          name="theme"
                          value={choice}
                          checked={theme === choice}
                          onChange={() => setTheme(choice)}
                          aria-describedby={
                            state.fieldErrors?.theme ? `${id}-theme-error` : undefined
                          }
                        />
                        <span>
                          <Icon size={20} aria-hidden="true" />
                          {choice === 'light' ? 'Light' : 'Dark'}
                          {theme === choice ? <b aria-hidden="true">✓</b> : null}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
                {state.fieldErrors?.theme ? (
                  <p
                    id={`${id}-theme-error`}
                    className="flex items-center gap-2 text-sm text-ds-danger"
                  >
                    <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
                    {state.fieldErrors.theme}
                  </p>
                ) : null}
                <p className={styles.description}>Booth Mode sets its own appearance for each screen.</p>
                <p className={styles.description}>
                  Save preferences to apply your phone number and appearance.
                </p>
              </div>
              <div className={styles.previews} aria-hidden="true">
                {(['light', 'dark'] as const).map((choice) => (
                  <div key={choice}>
                    <div data-theme={choice} className={`profile-theme-preview ${styles.preview}`}>
                      <div className={styles.previewRail}>
                        <Camera size={20} />
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className={styles.previewContent}>
                        <i />
                        <div />
                        <i />
                        <div />
                      </div>
                    </div>
                    <p className={styles.description}>
                      {choice === 'light' ? 'Light appearance' : 'Dark appearance'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </ProfileForm>
      <section aria-labelledby="password-heading" className={styles.section}>
        <div className={styles.sectionDescription}>
          <h2 className="m-0 mb-2 text-lg leading-[1.625rem] font-semibold" id="password-heading">
            Change password
          </h2>
          <p className="m-0 text-base leading-6 text-ds-text-muted">
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
            <div className={styles.fields}>
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
            </div>
          )}
        </ProfileForm>
      </section>
      <section aria-labelledby="session-heading" className={styles.section}>
        <div className={styles.sectionDescription}>
          <h2 className="m-0 mb-2 text-lg leading-[1.625rem] font-semibold" id="session-heading">
            Sign out
          </h2>
          <p className="m-0 text-base leading-6 text-ds-text-muted">
            Sign out of Admin on this device. Your other devices and Booth Mode stay signed in.
          </p>
        </div>
        <ProfileForm action={signOutAction} title="Sign out" pendingText="Signing out…" secondary />
      </section>
    </div>
  );
}
