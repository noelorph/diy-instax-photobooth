const activityLabels: Record<string, string> = {
  create_draft: 'Draft created',
  update_draft: 'Draft updated',
  start: 'Booth Mode started',
  complete: 'Event completed',
  cancel: 'Event cancelled',
  begin_delete_draft: 'Draft removal started',
  complete_delete_draft: 'Draft removed',
  add_packages: 'Film Packages added',
  pause: 'Booth Paused',
  resume: 'Booth Resumed',
  finish: 'Booth Mode finished',
  record_capture: 'Capture recorded',
  observe: 'Print feedback recorded',
  resolve_attempt: 'Print outcome resolved',
  reserve: 'Print requested',
  dispatch: 'Print dispatched',
  end_session: 'Guest session ended',
  reconcile: 'Print outcome reconciled',
};

export function activityLabel(kind: string) {
  return Object.hasOwn(activityLabels, kind) ? activityLabels[kind] : 'Event activity recorded';
}
