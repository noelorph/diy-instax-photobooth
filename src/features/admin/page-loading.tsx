import { FormFeedback } from '@/components/shared/form-feedback';

export function AdminPageLoading() {
  return (
    <div className="max-w-xl">
      <FormFeedback kind="status">Loading page…</FormFeedback>
    </div>
  );
}
