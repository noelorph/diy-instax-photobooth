FROM public.ecr.aws/supabase/storage-api@sha256:6a32896ae2d1ae2ea2d05ecaf6ed6c8a6b091739b469a8cf860ee89b2604d28f
COPY patched-handler.js /app/dist/storage/protocols/s3/s3-handler.js
COPY qualification-hook.cjs /app/qualification-hook.cjs
