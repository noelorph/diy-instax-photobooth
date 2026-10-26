-- CHECK treats unknown as passing; attached metadata must be explicitly present.
alter table public.event_media_assets add constraint event_media_complete_metadata
  check (state<>'attached' or (byte_length is not null and (kind<>'montage' or duration_ms is not null)));
