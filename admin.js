const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const API=SUPABASE_URL+'/functions/v1/pristine-api';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
let summary=null,network=null,session=null;
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
const date=v=>v?new Date(v).toLocaleDateString('en-US'):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));


async function apiRequest(action,opts={}){
  const r=await fetch(API+'?action='+encodeURIComponent(action),{method:opts.method||'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:opts.body?JSON.stringify(opts.body):undefined});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Request failed');return d;
}
async function fetchNetwork(){
  network=await apiRequest('admin-network-summary');
  renderNetwork();
}
function networkStatusLabel(s){return String(s||'new').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function renderNetwork(){
  if(!network)return;
  const m=network.metrics||{};
  $('#networkOpportunities').textContent=m.opportunities||0;
  $('#networkDistributorReview').textContent=m.distributor_review||0;
  $('#networkAwaitingIndustry').textContent=m.awaiting_manufacturer||0;
  $('#networkQuoteValue').textContent=money(m.quote_value||0);
  $('#networkOpenOrders').textContent=m.open_orders||0;
  $('#networkOrderValue').textContent=money(m.order_value||0)+' accepted value';
  $('#networkOpenSupply').textContent=(m.open_supply_requests||0)+' open';
  const distributors=new Map((network.distributors||[]).map(d=>[d.id,d]));
  const distSelect=$('#networkDistributorSelect');
  if(distSelect)distSelect.innerHTML=(network.distributors||[]).map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join('')||'<option value="">No distributors configured</option>';
  $('#networkOpportunityRows').innerHTML=(network.leads||[]).map(l=>'<tr><td>'+date(l.created_at)+'</td><td>'+esc(l.partners?.company_name||l.requester_company||'—')+'</td><td>'+esc([l.project_name,l.project_city,l.project_state].filter(Boolean).join(' · ')||'—')+'</td><td>'+esc(l.product_name||l.product_sku||l.material||'—')+'</td><td>'+Number(l.required_sqft||0).toLocaleString()+' sqft</td><td>'+esc(distributors.get(l.assigned_distributor_id)?.name||'Unassigned')+'</td><td><span class="status-pill '+esc(l.status)+'">'+esc(networkStatusLabel(l.status))+'</span></td></tr>').join('')||'<tr><td colspan="7">No network opportunities yet.</td></tr>';
  $('#networkSupplyRows').innerHTML=(network.supply_requests||[]).map(s=>'<tr><td>'+esc(s.distributors?.name||'—')+'</td><td>'+esc(s.catalog_variants?.sku||'—')+'</td><td>'+Number(s.requested_sqft||0).toLocaleString()+' sqft</td><td><span class="status-pill '+esc(s.status)+'">'+esc(networkStatusLabel(s.status))+'</span></td><td><input class="network-inline-input" data-supply-available="'+esc(s.id)+'" type="number" min="0" step="1" value="'+(s.available_sqft??s.requested_sqft??0)+'"></td><td><input class="network-inline-input" data-supply-cost="'+esc(s.id)+'" type="number" min="0" step=".01" value="'+(s.cost_sqft??'')+'"></td><td><input class="network-inline-input" data-supply-eta="'+esc(s.id)+'" type="number" min="0" step="1" value="'+(s.eta_days??'')+'"></td><td><input class="network-response-input" data-supply-note="'+esc(s.id)+'" value="'+esc(s.response_notes||'')+'" placeholder="Availability / lot / timing"></td><td><select class="network-status-select" data-supply-status="'+esc(s.id)+'"><option value="confirmed">Confirmed</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option><option value="cancelled">Cancelled</option></select><button class="network-respond-btn" data-supply-id="'+esc(s.id)+'" type="button">Respond</button></td></tr>').join('')||'<tr><td colspan="9">No manufacturer supply requests yet.</td></tr>';
  document.querySelectorAll('.network-respond-btn').forEach(b=>b.onclick=()=>respondSupply(b.dataset.supplyId));
  $('#networkDistributorCards').innerHTML=(network.distributors||[]).map(d=>'<div class="network-card"><strong>'+esc(d.name)+'</strong><span>'+esc(d.warehouse_address||d.office_address||'Address pending')+'</span><small>'+esc(d.email||'Contact pending')+'</small><a class="network-preview-link" href="distributor.html?distributor_id='+encodeURIComponent(d.id)+'" target="_blank" rel="noopener">Open distributor workspace →</a></div>').join('')||'<p class="form-message">No distributors configured.</p>';
  $('#networkMemberRows').innerHTML=(network.members||[]).map(x=>'<tr><td>'+esc(x.distributors?.name||'—')+'</td><td>'+esc(networkStatusLabel(x.role))+'</td><td><span class="status-pill '+(x.active?'active':'')+'">'+(x.active?'Active':'Inactive')+'</span></td></tr>').join('')||'<tr><td colspan="3">No distributor users linked yet.</td></tr>';
  $('#networkOrderRows').innerHTML=(network.orders||[]).map(o=>'<tr><td>'+date(o.created_at)+'</td><td>'+esc(o.material_leads?.project_name||'—')+'</td><td>'+esc(o.material_leads?.product_name||o.material_leads?.product_sku||'—')+'</td><td>'+esc(o.distributors?.name||'—')+'</td><td>'+money(o.total)+'</td><td>'+esc(networkStatusLabel(o.delivery_method))+'</td><td>'+esc(o.scheduled_for?new Date(o.scheduled_for).toLocaleString('en-US'):'—')+'</td><td><span class="status-pill '+esc(o.status)+'">'+esc(networkStatusLabel(o.status))+'</span></td></tr>').join('')||'<tr><td colspan="8">No accepted material orders yet.</td></tr>';
}
async function respondSupply(id){
  const btn=document.querySelector('[data-supply-id="'+id+'"]');if(btn)btn.disabled=true;
  try{
    await apiRequest('admin-supply-response',{method:'POST',body:{
      request_id:id,
      status:document.querySelector('[data-supply-status="'+id+'"]').value,
      available_sqft:Number(document.querySelector('[data-supply-available="'+id+'"]').value||0),
      cost_sqft:Number(document.querySelector('[data-supply-cost="'+id+'"]').value||0),
      eta_days:Number(document.querySelector('[data-supply-eta="'+id+'"]').value||0),
      notes:document.querySelector('[data-supply-note="'+id+'"]').value
    }});
    await fetchNetwork();
  }catch(e){alert(e.message)}finally{if(btn)btn.disabled=false}
}
async function addDistributorMember(){
  const msg=$('#networkMemberMessage');msg.textContent='Linking account…';
  try{
    const d=await apiRequest('admin-add-distributor-member',{method:'POST',body:{distributor_id:$('#networkDistributorSelect').value,email:$('#networkMemberEmail').value.trim(),role:$('#networkMemberRole').value}});
    msg.textContent='Access added for '+(d.account?.email||'account')+'.';
    $('#networkMemberEmail').value='';
    await fetchNetwork();
  }catch(e){msg.textContent=e.message}
}

function activateTab(name){
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));
}
document.querySelectorAll('.nav-item').forEach(x=>x.onclick=()=>activateTab(x.dataset.tab));

async function fetchSummary(){
  if(!session)return;
  $('#adminRole').textContent='Loading...';
  const r=await fetch(API+'?action=admin-summary',{headers:{Authorization:'Bearer '+session.access_token}});
  const d=await r.json();
  if(!r.ok||!d.ok)throw new Error(d.error||'Admin access failed');
  summary=d;render();$('#adminRole').textContent='Admin · '+d.role;
  try{await fetchNetwork()}catch(e){console.error('Network workspace:',e)}
}
function render(){
  const m=summary.metrics||{};
  $('#mrr').textContent=money(m.mrr);$('#arr').textContent=money(m.arr);$('#revenueMonth').textContent=money(m.revenue_this_month);
  $('#monthlyCosts').textContent=money(m.monthly_costs);$('#margin').textContent=money(m.projected_operating_margin);$('#realizedNet').textContent=money(m.realized_net_this_month);$('#aiCost').textContent=money(m.ai_cost_month);
  $('#lifetimeRevenue').textContent='Lifetime revenue: '+money(m.realized_revenue);
  $('#accounts').textContent=m.accounts||0;$('#freeAccounts').textContent=m.free_accounts||0;$('#proAccounts').textContent=m.pro_accounts||0;$('#pastDue').textContent=m.past_due||0;
  $('#estimates').textContent=m.estimates||0;$('#invoices').textContent=m.invoices||0;$('#accepted').textContent=m.accepted_estimates||0;$('#materialLeads').textContent=m.material_leads||0;
  $('#aiActions').textContent=(m.ai_actions_month||0)+' actions this month';
  $('#aiEmailStatus').textContent=summary.health?.openai?'AI service active':'Waiting for OpenAI key';
  $('#aiRulesStatus').textContent=(m.enabled_rules||0)+' enabled rules';
  $('#aiReviewStatus').textContent=(m.review||0)+' waiting';
  $('#aiPendingStatus').textContent=(m.pending||0)+' pending';
  $('#aiSentStatus').textContent=(m.sent||0)+' sent';
  $('#aiFailedStatus').textContent=(m.failed||0)+' failed';
  const partners=new Map((summary.partners||[]).map(p=>[p.id,p]));
  $('#subscriptionRows').innerHTML=(summary.subscriptions||[]).map(s=>{const p=partners.get(s.partner_id)||{};return '<tr><td>'+esc(p.company_name||'—')+'</td><td>'+esc(s.email||p.email||'—')+'</td><td><span class="status-pill '+esc(s.status)+'">'+esc(s.status)+'</span></td><td>'+money(s.monthly_amount)+'</td><td>'+date(s.current_period_end)+'</td><td>'+esc(s.stripe_subscription_id||'—')+'</td></tr>'}).join('')||'<tr><td colspan="6">No Pro subscriptions yet.</td></tr>';
  $('#billingEventRows').innerHTML=(summary.billing_events||[]).slice(0,15).map(e=>'<tr><td>'+date(e.occurred_at)+'</td><td>'+esc(e.event_type)+'</td><td><span class="status-pill '+esc(e.status||'')+'">'+esc(e.status||'—')+'</span></td><td>'+money(e.amount)+'</td></tr>').join('')||'<tr><td colspan="4">No billing events recorded yet.</td></tr>';
  $('#costRows').innerHTML=(summary.costs||[]).map(c=>'<tr><td>'+esc(c.cost_date)+'</td><td>'+esc(c.category)+'</td><td>'+esc(c.vendor||'—')+'</td><td>'+esc(c.description)+'</td><td>'+esc(c.cadence)+'</td><td>'+money(c.amount)+'</td><td><button class="cost-toggle status-pill '+(c.active?'active':'')+'" data-id="'+esc(c.id)+'" data-active="'+String(Boolean(c.active))+'">'+(c.active?'Active':'Inactive')+'</button></td></tr>').join('')||'<tr><td colspan="7">No costs entered yet.</td></tr>';
  document.querySelectorAll('.cost-toggle').forEach(btn=>btn.onclick=()=>toggleCost(btn.dataset.id,btn.dataset.active==='true'));
  $('#aiRows').innerHTML=(summary.ai_activity||[]).map(a=>'<tr><td>'+date(a.created_at)+'</td><td>'+esc(a.event_type||a.rule_key||'—')+'</td><td>'+esc(a.model||'—')+'</td><td>'+esc(a.status)+'</td><td>'+Number(a.input_tokens||0).toLocaleString()+'</td><td>'+Number(a.output_tokens||0).toLocaleString()+'</td><td>'+money(a.estimated_cost)+'</td></tr>').join('')||'<tr><td colspan="7">No AI usage recorded yet.</td></tr>';
  $('#automationRows').innerHTML=(summary.automation_queue||[]).map(a=>'<tr><td>'+date(a.created_at)+'</td><td>'+esc(a.rule_key)+'</td><td><span class="status-pill '+esc(a.status)+'">'+esc(a.status)+'</span></td><td>'+esc(a.recipient||'—')+'</td><td>'+Number(a.attempts||0)+'</td><td class="error-cell">'+esc(a.last_error||'—')+'</td></tr>').join('')||'<tr><td colspan="6">No automation tasks yet.</td></tr>';
  const h=summary.health||{};
  setHealth('#healthStripe',h.stripe_webhook?'Configured · Sandbox':'Not configured',h.stripe_webhook);
  setHealth('#healthResend',h.resend?'Active':'Not configured',h.resend);
  setHealth('#healthOpenAI',h.openai?('Active · '+esc(h.openai_model||'')):'API key required',h.openai);
  setHealth('#healthScheduler',h.automation_scheduler?'Active · hourly':'Not active',h.automation_scheduler);
  $('#schedulerLastRun').textContent=h.automation_last_run?new Date(h.automation_last_run).toLocaleString('en-US'):'No recorded run yet';
  let last='—';try{if(h.automation_last_result){const x=JSON.parse(h.automation_last_result);last=(x.processed||0)+' processed · '+(x.sent||0)+' sent · '+(x.review||0)+' review · '+(x.failed||0)+' failed'}}catch{}
  $('#schedulerLastResult').textContent=last;
}
function setHealth(sel,text,ok){const el=$(sel);if(!el)return;el.textContent=text;el.classList.toggle('health-ok',!!ok);el.classList.toggle('health-warn',!ok)}
async function toggleCost(id,active){
  const {error}=await sb.from('platform_costs').update({active:!active,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){alert(error.message);return}
  await fetchSummary();
}
async function saveCost(){
  $('#costMessage').textContent='Saving...';
  const row={category:$('#costCategory').value,vendor:$('#costVendor').value.trim()||null,description:$('#costDescription').value.trim(),amount:Number($('#costAmount').value||0),cadence:$('#costCadence').value,cost_date:$('#costDate').value||new Date().toISOString().slice(0,10),notes:$('#costNotes').value.trim()||null,created_by:session.user.id};
  if(!row.description||row.amount<0)return $('#costMessage').textContent='Description and valid amount are required.';
  const {error}=await sb.from('platform_costs').insert(row);
  if(error)return $('#costMessage').textContent=error.message;
  $('#costMessage').textContent='Cost added.';$('#costDescription').value='';$('#costAmount').value='';$('#costNotes').value='';await fetchSummary();
}
$('#saveCost').onclick=saveCost;$('#refreshAdmin').onclick=fetchSummary;$('#costDate').value=new Date().toISOString().slice(0,10);
$('#addDistributorMemberBtn').onclick=addDistributorMember;
$('#adminSignOut').onclick=async()=>{await sb.auth.signOut();location.href='/'};

(async()=>{
  try{
    const {data}=await sb.auth.getSession();session=data.session;
    if(!session){location.href='/?admin=1';return}
    await fetchSummary();
    $('#accessGate').classList.add('hidden');$('#adminApp').classList.remove('hidden');
  }catch(e){
    $('#accessGate').innerHTML='<div class="gate-card"><h2>Access denied</h2><p>'+esc(e.message||'Administrator access required')+'</p><a href="/">Return to Pristine</a></div>';
  }
})();