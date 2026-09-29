const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const API=SUPABASE_URL+'/functions/v1/pristine-api';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
const date=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
let session=null,data=null,currentLead=null;

async function api(action,opts={}){
  const r=await fetch(API+'?action='+encodeURIComponent(action)+(opts.query||''),{method:opts.method||'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:opts.body?JSON.stringify(opts.body):undefined});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Network request failed');return d;
}
function statusLabel(s){return String(s||'new').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function activateTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.dataset.panel===name))}
document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>activateTab(x.dataset.tab));

async function load(){
  const d=await api('distributor-dashboard');
  data=d;
  $('#distributorName').textContent=d.distributor?.name||'Distributor Workspace';
  $('#accessGate').classList.add('hidden');$('#distApp').classList.remove('hidden');
  render();
}
function render(){
  const leads=data.leads||[],quotes=data.quotes||[],supply=data.supply_requests||[];
  $('#metricOpen').textContent=leads.filter(x=>['new','distributor_review','quote_ready'].includes(x.status)).length;
  $('#metricIndustry').textContent=leads.filter(x=>x.status==='awaiting_manufacturer').length;
  $('#metricQuoted').textContent=quotes.filter(x=>x.status==='submitted').length;
  $('#metricValue').textContent=money(quotes.filter(x=>['submitted','accepted'].includes(x.status)).reduce((s,x)=>s+Number(x.total||0),0));
  renderOpportunities();renderSupply();renderQuotes();
}
function renderOpportunities(){
  const filter=$('#statusFilter').value;
  const leads=(data.leads||[]).filter(x=>!filter||x.status===filter);
  $('#opportunityList').innerHTML=leads.map(l=>'<article class="opp-card"><div class="opp-main"><strong>'+esc(l.product_name||l.material||'Material request')+'</strong><small>'+esc(l.product_sku?'SKU '+l.product_sku:(l.product_sizes||[]).join(', '))+'</small><small>'+esc(l.partners?.company_name||l.requester_company||'Pristine installer')+' · '+esc(l.project_name||'Project')+'</small></div><div class="opp-cell"><small>Required material</small><strong>'+Number(l.required_sqft||0).toLocaleString()+' sqft</strong></div><div class="opp-cell location-cell"><small>Delivery</small><strong>'+esc([l.project_city,l.project_state,l.project_zip].filter(Boolean).join(', ')||'—')+'</strong></div><div class="opp-cell"><small>Status</small><span class="status '+esc(l.status)+'">'+esc(statusLabel(l.status))+'</span></div><button class="open-btn" data-lead="'+esc(l.id)+'" type="button">Open</button></article>').join('')||'<div class="empty">No material opportunities in this view.</div>';
  document.querySelectorAll('[data-lead]').forEach(b=>b.onclick=()=>openLead(b.dataset.lead));
}
function renderSupply(){
  $('#supplyRows').innerHTML=(data.supply_requests||[]).map(s=>'<tr><td>'+date(s.created_at)+'</td><td>'+esc(shortId(s.material_lead_id))+'</td><td>'+esc(s.catalog_variants?.sku||'—')+'</td><td>'+Number(s.requested_sqft||0).toLocaleString()+' sqft</td><td><span class="status '+esc(s.status)+'">'+esc(statusLabel(s.status))+'</span></td><td>'+esc(s.response_notes||((s.eta_days??null)!==null?'ETA '+s.eta_days+' days':'—'))+'</td></tr>').join('')||'<tr><td colspan="6">No manufacturer requests yet.</td></tr>';
}
function renderQuotes(){
  $('#quoteRows').innerHTML=(data.quotes||[]).map(q=>'<tr><td>'+date(q.created_at)+'</td><td>'+esc(shortId(q.material_lead_id))+'</td><td>'+Number(q.quantity_sqft||0).toLocaleString()+' sqft</td><td>'+money(q.unit_price_sqft)+'</td><td>'+money(q.total)+'</td><td>'+((q.eta_days??null)!==null?esc(q.eta_days+' days'):'—')+'</td><td><span class="status '+esc(q.status)+'">'+esc(statusLabel(q.status))+'</span></td></tr>').join('')||'<tr><td colspan="7">No quotes submitted yet.</td></tr>';
}
function shortId(id){return id?String(id).slice(0,8).toUpperCase():'—'}
function leadEvents(id){return (data.events||[]).filter(x=>x.material_lead_id===id)}
function leadQuotes(id){return (data.quotes||[]).filter(x=>x.material_lead_id===id)}
function leadSupply(id){return (data.supply_requests||[]).filter(x=>x.material_lead_id===id)}

function openLead(id){
  const l=(data.leads||[]).find(x=>x.id===id);if(!l)return;currentLead=l;
  $('#drawerTitle').textContent=l.product_name||l.material||'Material request';
  $('#drawerMeta').textContent=(l.product_sku?'SKU '+l.product_sku+' · ':'')+Number(l.required_sqft||0).toLocaleString()+' sqft · '+([l.project_city,l.project_state,l.project_zip].filter(Boolean).join(', ')||'Delivery location pending');
  const latestSupply=leadSupply(id)[0],latestQuote=leadQuotes(id)[0];
  $('#drawerBody').innerHTML='<section class="detail-card"><h3>Opportunity</h3><div class="detail-grid"><div><span>Installer</span><strong>'+esc(l.partners?.company_name||l.requester_company||'—')+'</strong></div><div><span>Customer / requester</span><strong>'+esc(l.requester_name||'—')+'</strong></div><div><span>Project</span><strong>'+esc(l.project_name||'—')+'</strong></div><div><span>Required</span><strong>'+Number(l.required_sqft||0).toLocaleString()+' sqft'+(l.calculated_boxes?' · '+l.calculated_boxes+' boxes':'')+'</strong></div><div><span>Product</span><strong>'+esc([l.product_name,l.product_sku,l.custom_size].filter(Boolean).join(' · ')||l.material)+'</strong></div><div><span>Estimate</span><strong>'+esc(l.estimate_no||'—')+'</strong></div></div></section>'+
  '<section class="detail-card"><h3>Distributor status</h3><div class="form-grid"><label class="wide">Workflow status<select id="drawerStatus">'+['new','distributor_review','awaiting_manufacturer','quote_ready','quoted','accepted','declined','ordered','fulfilled','lost'].map(s=>'<option value="'+s+'" '+(l.status===s?'selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select></label></div><div class="action-row"><button id="updateStatusBtn" class="btn dark" type="button">Update status</button></div><p id="statusMessage" class="form-message"></p></section>'+
  '<section class="detail-card"><h3>Check inventory / request industry</h3><p class="form-message">'+(latestSupply?'Latest industry request: '+statusLabel(latestSupply.status)+(latestSupply.response_notes?' · '+esc(latestSupply.response_notes):''):'If stock is insufficient, request the shortage from the manufacturer without re-entering project data.')+'</p><div class="form-grid"><label>Shortage sqft<input id="supplySqft" type="number" min="0" step="1" value="'+Number(l.required_sqft||0)+'"></label><label>Boxes<input id="supplyBoxes" type="number" min="0" step="1" value="'+Number(l.calculated_boxes||0)+'"></label><label class="wide">Notes<textarea id="supplyNotes" rows="3" placeholder="Stock shortage, requested color/lot, delivery constraints…"></textarea></label></div><div class="action-row"><button id="requestSupplyBtn" class="btn secondary" type="button">Request from Industry</button></div><p id="supplyMessage" class="form-message"></p></section>'+
  '<section class="detail-card"><h3>Return quote to installer</h3><p class="form-message">'+(latestQuote?'Latest submitted quote: '+money(latestQuote.total):'Create the material quote that the installer will receive in Pristine.')+'</p><div class="form-grid"><label>Quantity sqft<input id="quoteQty" type="number" min="0" step="1" value="'+Number(l.required_sqft||0)+'"></label><label>Unit price / sqft<input id="quoteUnit" type="number" min="0" step=".01" value="'+Number(l.unit_price_sqft||0)+'"></label><label>Freight<input id="quoteFreight" type="number" min="0" step=".01" value="0"></label><label>Tax<input id="quoteTax" type="number" min="0" step=".01" value="0"></label><label>ETA days<input id="quoteEta" type="number" min="0" step="1"></label><label>Valid through<input id="quoteExpires" type="date"></label><label class="wide">Quote notes<textarea id="quoteNotes" rows="3"></textarea></label></div><div class="action-row"><button id="submitQuoteBtn" class="btn gold" type="button">Submit quote to installer</button></div><p id="quoteMessage" class="form-message"></p></section>'+
  '<section class="detail-card"><h3>Shared timeline</h3><div class="timeline">'+(leadEvents(id).map(e=>'<div class="timeline-item"><strong>'+esc(statusLabel(e.event_type))+'</strong><p>'+esc(e.message||'Network activity')+'</p><small>'+date(e.created_at)+' · '+esc(statusLabel(e.actor_type))+'</small></div>').join('')||'<div class="empty">No network timeline events yet.</div>')+'</div></section>';
  $('#updateStatusBtn').onclick=updateStatus;$('#requestSupplyBtn').onclick=requestSupply;$('#submitQuoteBtn').onclick=submitQuote;
  $('#opportunityDrawer').classList.remove('hidden');$('#opportunityDrawer').setAttribute('aria-hidden','false');
}
function closeDrawer(){$('#opportunityDrawer').classList.add('hidden');$('#opportunityDrawer').setAttribute('aria-hidden','true');currentLead=null}
$('#closeDrawerBtn').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;

async function updateStatus(){
  try{$('#statusMessage').textContent='Updating…';await api('distributor-update-opportunity',{method:'POST',body:{distributor_id:data.membership.distributor_id,lead_id:currentLead.id,status:$('#drawerStatus').value}});await load();openLead(currentLead?.id||'')}catch(e){$('#statusMessage').textContent=e.message}
}
async function requestSupply(){
  const id=currentLead.id;
  try{$('#supplyMessage').textContent='Sending to industry…';await api('distributor-request-supply',{method:'POST',body:{distributor_id:data.membership.distributor_id,lead_id:id,requested_sqft:Number($('#supplySqft').value||0),requested_boxes:Number($('#supplyBoxes').value||0),notes:$('#supplyNotes').value}});await load();openLead(id)}catch(e){$('#supplyMessage').textContent=e.message}
}
async function submitQuote(){
  const id=currentLead.id;
  try{$('#quoteMessage').textContent='Submitting quote…';await api('distributor-submit-quote',{method:'POST',body:{distributor_id:data.membership.distributor_id,lead_id:id,quantity_sqft:Number($('#quoteQty').value||0),unit_price_sqft:Number($('#quoteUnit').value||0),freight:Number($('#quoteFreight').value||0),tax:Number($('#quoteTax').value||0),eta_days:Number($('#quoteEta').value||0),expires_at:$('#quoteExpires').value||null,notes:$('#quoteNotes').value}});await load();openLead(id)}catch(e){$('#quoteMessage').textContent=e.message}
}
$('#statusFilter').onchange=renderOpportunities;$('#refreshBtn').onclick=load;$('#signOutBtn').onclick=async()=>{await sb.auth.signOut();location.href='/'};

(async()=>{
  try{const {data:s}=await sb.auth.getSession();session=s.session;if(!session){location.href='/?distributor=1';return}await load()}
  catch(e){$('#accessGate').innerHTML='<div class="gate-card"><p class="eyebrow">DISTRIBUTOR WORKSPACE</p><h1>Access not configured</h1><p>'+esc(e.message||'This Pristine account is not linked to a distributor.')+'</p><a class="btn dark" href="calculator.html">Open Installer Workspace</a></div>'}
})();