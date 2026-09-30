revoke all on table public.distributor_members from authenticated;
revoke all on table public.material_quotes from authenticated;
revoke all on table public.manufacturer_supply_requests from authenticated;
revoke all on table public.opportunity_events from authenticated;

grant select on table public.distributor_members to authenticated;
grant select,insert,update on table public.material_quotes to authenticated;
grant select,insert,update on table public.manufacturer_supply_requests to authenticated;
grant select on table public.opportunity_events to authenticated;
