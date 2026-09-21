const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const API=SUPABASE_URL+'/functions/v1/pristine-api';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
let summary=null,session=null;
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
const date=v=>v?new Date(v).toLocaleDateString('en-US'):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

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