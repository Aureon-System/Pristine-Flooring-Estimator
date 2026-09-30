alter table public.material_leads add column if not exists project_county text;
create index if not exists idx_material_leads_project_location on public.material_leads(project_state,project_county,project_zip);
