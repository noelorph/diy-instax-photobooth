'use client';
import { unstable_rethrow } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ProfileAction, ProfileData, ProfileState } from './state';

function ProfileForm({
  action,
  title,
  pendingText,
  children,
}: {
  action: ProfileAction;
  title: string;
  pendingText: string;
  children?: (state: ProfileState, id: string) => ReactNode;
}) {
  const id = useId();
  const feedback = useRef<HTMLParagraphElement>(null);
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
      className="auth-form"
      action={submit}
      aria-busy={pending}
      noValidate
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {children?.(state, id)}
      {state.error || state.fieldErrors ? (
        <p className="auth-alert" role="alert" tabIndex={-1} ref={feedback}>
          {state.error ?? 'Correct the highlighted fields and try again.'}
        </p>
      ) : null}
      {state.confirmation ? (
        <p className="profile-success" role="status" tabIndex={-1} ref={feedback}>
          {state.confirmation}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {title}
      </button>
      {pending ? <p role="status">{pendingText}</p> : null}
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
}: {
  label: string;
  name: string;
  id: string;
  state: ProfileState;
  value: string;
  onChange: (value: string) => void;
  password?: boolean;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <input
        id={`${id}-${name}`}
        name={name}
        type={password ? 'password' : 'tel'}
        autoComplete={password ? 'new-password' : 'tel'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={password ? 128 : 40}
        aria-invalid={Boolean(state.fieldErrors?.[name])}
        aria-describedby={state.fieldErrors?.[name] ? `${id}-${name}-error` : undefined}
      />
      {state.fieldErrors?.[name] ? (
        <p id={`${id}-${name}-error`} className="auth-field-error">
          {state.fieldErrors[name]}
        </p>
      ) : null}
    </div>
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
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  return (
    <div className="profile-content">
      <header>
        <p className="page-eyebrow">Your account</p>
        <h1>Profile</h1>
        <p>Manage your account and how Admin pages appear.</p>
      </header>
      <section aria-labelledby="preferences-heading" className="profile-section">
        <div>
          <h2 id="preferences-heading">Account preferences</h2>
          <p className="profile-email">
            <span>Email</span>
            <br />
            {initial.email}
          </p>
        </div>
        <ProfileForm action={saveAction} title="Save preferences" pendingText="Saving preferences…">
          {(state, id) => (
            <>
              <Field
                label="Phone number"
                name="phone"
                id={id}
                state={state}
                value={phone}
                onChange={setPhone}
              />
              <p className="field-help">Optional. Include your country code.</p>
              <div className="auth-field">
                <label htmlFor={`${id}-theme`}>Appearance</label>
                <select
                  id={`${id}-theme`}
                  name="theme"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}
                  aria-invalid={Boolean(state.fieldErrors?.theme)}
                  aria-describedby={state.fieldErrors?.theme ? `${id}-theme-error` : undefined}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
                {state.fieldErrors?.theme ? (
                  <p className="auth-field-error" id={`${id}-theme-error`}>
                    {state.fieldErrors.theme}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </ProfileForm>
      </section>
      <section aria-labelledby="password-heading" className="profile-section">
        <div>
          <h2 id="password-heading">Password</h2>
          <p>Use 12–128 characters for your new password.</p>
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
      <section aria-labelledby="session-heading" className="profile-section">
        <div>
          <h2 id="session-heading">This device</h2>
          <p>Sign out of Admin on this device. Your other devices stay signed in.</p>
        </div>
        <ProfileForm action={signOutAction} title="Sign out" pendingText="Signing out…" />
      </section>
    </div>
  );
}
