revoke insert, delete, truncate, references, trigger on public.material_leads from authenticated;
grant select, update on public.material_leads to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.distributor_offers from authenticated;
grant select on public.distributor_offers to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.material_quotes from authenticated;
grant select on public.material_quotes to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.manufacturer_supply_requests from authenticated;
grant select on public.manufacturer_supply_requests to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.material_orders from authenticated;
grant select on public.material_orders to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.opportunity_events from authenticated;
grant select on public.opportunity_events to authenticated;
