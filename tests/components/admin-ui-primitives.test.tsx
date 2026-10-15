import { createRef, useState } from 'react';
import Link from 'next/link';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FormField } from '@/components/shared/form-field';
import { FormFeedback } from '@/components/shared/form-feedback';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button, buttonVariants } from '@/components/ui/button';

afterEach(cleanup);

it('associates the visible label, help, and current error with the control', () => {
  const field = (error?: string) => (
    <FormField id="email" label="Email" help="Use your account email." error={error}>
      {(a11y) => <Input {...a11y} />}
    </FormField>
  );
  const { rerender } = render(field('Enter a valid email.'));
  const input = screen.getByRole('textbox', { name: 'Email' });
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(
    input
      .getAttribute('aria-describedby')
      ?.split(' ')
      .map((id) => document.getElementById(id)?.textContent)
  ).toEqual(['Use your account email.', 'Enter a valid email.']);
  rerender(field());
  expect(input.getAttribute('aria-invalid')).toBe('false');
  expect(
    input
      .getAttribute('aria-describedby')
      ?.split(' ')
      .map((id) => document.getElementById(id)?.textContent)
  ).toEqual(['Use your account email.']);
  expect(screen.queryByText('Enter a valid email.')).toBeNull();
});

it('omits describedby when there is no helper or error', () => {
  render(
    <FormField id="name" label="Name">
      {(a11y) => <Input {...a11y} />}
    </FormField>
  );
  expect(screen.getByLabelText('Name').hasAttribute('aria-describedby')).toBe(false);
});

it('preserves input registration, native submission, and ref access', () => {
  const ref = createRef<HTMLInputElement>();
  function Form() {
    const [value, setValue] = useState('');
    return (
      <form>
        <FormField id="name" label="Name">
          {(a11y) => (
            <Input
              {...a11y}
              name="name"
              ref={ref}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </FormField>
        <output>{value}</output>
      </form>
    );
  }
  render(<Form />);
  const input = screen.getByLabelText('Name') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Ada' } });
  expect(screen.getByRole('status').textContent).toBe('Ada');
  expect(new FormData(input.form!).get('name')).toBe('Ada');
  expect(ref.current).toBe(input);
});

it('preserves native select field associations and submitted values', () => {
  const ref = createRef<HTMLSelectElement>();
  render(
    <form>
      <FormField id="theme" label="Theme">
        {(a11y) => (
          <NativeSelect {...a11y} name="theme" ref={ref}>
            <NativeSelectOption value="light">Light</NativeSelectOption>
            <NativeSelectOption value="dark">Dark</NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
    </form>
  );
  const select = screen.getByRole('combobox', { name: 'Theme' }) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: 'dark' } });
  expect(new FormData(select.form!).get('theme')).toBe('dark');
  expect(ref.current).toBe(select);
});

it('prevents disabled actions from activating', () => {
  let activated = false;
  render(
    <Button
      disabled
      onClick={() => {
        activated = true;
      }}
    >
      Saving
    </Button>
  );
  const button = screen.getByRole('button', { name: 'Saving' }) as HTMLButtonElement;
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(activated).toBe(false);
});

it('styles navigation without replacing its anchor semantics', () => {
  render(
    <Link href="/events/new" className={buttonVariants()}>
      Create Event
    </Link>
  );
  const link = screen.getByRole('link', { name: 'Create Event' });
  expect(link.tagName).toBe('A');
  expect(link.getAttribute('href')).toBe('/events/new');
  expect(screen.queryByRole('button')).toBeNull();
});

it('announces errors assertively and completion politely with a focusable ref', () => {
  const ref = createRef<HTMLDivElement>();
  const { rerender } = render(
    <FormFeedback kind="error" feedbackRef={ref} tabIndex={-1}>
      Try again.
    </FormFeedback>
  );
  expect(screen.getByRole('alert').textContent).toContain('Try again.');
  ref.current?.focus();
  expect(document.activeElement).toBe(ref.current);
  rerender(<FormFeedback kind="success">Saved.</FormFeedback>);
  expect(screen.getByRole('status').textContent).toContain('Saved.');
  expect(screen.queryByRole('alert')).toBeNull();
});
