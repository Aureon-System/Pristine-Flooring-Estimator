drop index if exists public.idx_documents_partner_client_id;
create unique index idx_documents_partner_client_id
  on public.documents(partner_id, client_document_id);
