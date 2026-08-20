-- AgentForge flagship knowledge ingestion: trace every synchronized source to
-- its derived documents without storing source credentials or raw files.

alter table public.knowledge_documents
  add column if not exists source_id uuid
    references public.knowledge_sources(id) on delete set null;

alter table public.knowledge_sources
  add column if not exists sync_count integer not null default 0
    check (sync_count >= 0),
  add column if not exists last_document_id uuid
    references public.knowledge_documents(id) on delete set null;

create index if not exists knowledge_documents_source_created_idx
  on public.knowledge_documents(source_id, created_at desc)
  where source_id is not null;

create index if not exists knowledge_sources_due_sync_idx
  on public.knowledge_sources(next_sync_at)
  where status in ('ready', 'failed') and next_sync_at is not null;

