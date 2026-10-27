import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EventMediaEditor } from '@/features/admin/events/event-media';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps planned media visible without file selection or upload requests during the hold', () => {
  const requests = vi.fn();
  vi.stubGlobal('fetch', requests);
  const { container } = render(<EventMediaEditor />);
  const media = screen.getByRole('region', { name: 'Event Media' });

  expect(within(media).getByRole('status').textContent).toMatch(/temporarily unavailable/i);
  expect(within(media).getByRole('status').textContent).toMatch(
    /before re-enabling uploads, verify cleanup of interrupted or late uploads and leftover files/i
  );
  expect(within(media).getByRole('heading', { name: 'Background image' })).toBeTruthy();
  expect(within(media).getByRole('heading', { name: 'Welcome montage' })).toBeTruthy();
  expect(container.querySelector('input[type="file"]')).toBeNull();
  for (const button of within(media).getAllByRole('button')) {
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
  }
  expect(within(media).getAllByRole('button')).toHaveLength(2);
  expect(container.querySelector('img, video, source')).toBeNull();
  expect(requests).not.toHaveBeenCalled();
});
