alter table public.documents add column if not exists manage_token_hash text;
create index if not exists idx_documents_manage_token_hash on public.documents(manage_token_hash);

alter table public.communications add column if not exists document_public_token uuid;
create index if not exists idx_communications_doc_created on public.communications(document_id, created_at desc);
