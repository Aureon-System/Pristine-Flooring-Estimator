const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const API=SUPABASE_URL+'/functions/v1/pristine-api';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
const date=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
let session=null,data=null,currentLead=null;
const requestedDistributorId=new URLSearchParams(location.search).get('distributor_id')||'';

async function api(action,opts={}){
  const r=await fetch(API+'?action='+encodeURIComponent(action)+(opts.query||''),{method:opts.method||'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:opts.body?JSON.stringify(opts.body):undefined});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Network request failed');return d;
}
function statusLabel(s){return String(s||'new').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function activateTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.dataset.panel===name))}
document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>activateTab(x.dataset.tab));

async function load(){
  const d=await api('distributor-dashboard',{query:requestedDistributorId?'&distributor_id='+encodeURIComponent(requestedDistributorId):''});
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
  renderOpportunities();renderSupply();renderQuotes();renderOrders();renderCatalog();renderInstallerNetwork();
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
function renderOrders(){
  const orders=data.orders||[];
  $('#orderList').innerHTML=orders.map(o=>{
    const lead=(data.leads||[]).find(l=>l.id===o.material_lead_id)||{};
    const statuses=['accepted','confirmed','processing','ready','out_for_delivery','delivered','picked_up','cancelled'];
    return '<article class="opp-card order-card"><div class="opp-main"><strong>'+esc(lead.product_name||lead.material||'Material order')+'</strong><small>'+esc(lead.product_sku?'SKU '+lead.product_sku:'Order '+shortId(o.id))+'</small><small>'+esc(lead.project_name||'Project')+' · '+esc([o.delivery_city,o.delivery_state,o.delivery_zip].filter(Boolean).join(', ')||'Delivery location pending')+'</small></div><div class="opp-cell"><small>Order total</small><strong>'+money(o.total)+'</strong></div><div class="order-controls"><select data-order-status="'+esc(o.id)+'">'+statuses.map(st=>'<option value="'+st+'" '+(o.status===st?'selected':'')+'>'+statusLabel(st)+'</option>').join('')+'</select><select data-order-method="'+esc(o.id)+'"><option value="delivery" '+(o.delivery_method==='delivery'?'selected':'')+'>Delivery</option><option value="pickup" '+(o.delivery_method==='pickup'?'selected':'')+'>Pickup</option></select><input data-order-schedule="'+esc(o.id)+'" type="datetime-local" value="'+esc(o.scheduled_for?String(o.scheduled_for).slice(0,16):'')+'" aria-label="Scheduled date"><input data-order-track="'+esc(o.id)+'" value="'+esc(o.tracking_reference||'')+'" placeholder="PO / tracking / delivery ref"><button class="btn dark" data-order-save="'+esc(o.id)+'" type="button">Save fulfillment</button></div></article>';
  }).join('')||'<div class="empty">Accepted quotes will appear here as material orders.</div>';
  document.querySelectorAll('[data-order-save]').forEach(b=>b.onclick=()=>updateOrder(b.dataset.orderSave));
}
function renderCatalog(){
  const body=$('#catalogRows');if(!body)return;
  const role=String(data.membership?.role||'');
  const canEdit=['owner','manager'].includes(role);
  const note=$('#catalogRoleNote');
  if(note)note.textContent=canEdit?'Owner/manager pricing controls are active.':'Catalog pricing is read-only for your '+statusLabel(role)+' role.';
  const q=String($('#catalogSearch')?.value||'').trim().toLowerCase();
  const offers=(data.offers||[]).filter(o=>{
    const v=o.catalog_variants||{},p=v.catalog_products||{};
    return !q||[v.sku,v.name,v.size,p.collection,p.category].some(x=>String(x||'').toLowerCase().includes(q));
  });
  body.innerHTML=offers.map(o=>{
    const v=o.catalog_variants||{},p=v.catalog_products||{};
    const disabled=canEdit?'':' disabled';
    return '<tr><td><strong>'+esc(v.name||'Product')+'</strong><small class="table-sub">'+esc(p.collection||'')+'</small></td><td>'+esc(v.sku||'—')+'</td><td>'+esc(v.size||'—')+'</td><td><input class="network-inline-input" data-offer-price="'+esc(o.id)+'" type="number" min="0" step=".01" value="'+Number(o.price_sqft||0)+'"'+disabled+'></td><td><input class="network-inline-input" data-offer-stock="'+esc(o.id)+'" type="number" min="0" step="1" value="'+Number(o.stock_sqft||0)+'"'+disabled+'></td><td><input class="network-inline-input" data-offer-lead="'+esc(o.id)+'" type="number" min="0" step="1" value="'+Number(o.lead_time_days||0)+'"'+disabled+'></td><td><select class="network-status-select" data-offer-availability="'+esc(o.id)+'"'+disabled+'>'+['in_stock','limited','special_order','out_of_stock','unknown'].map(a=>'<option value="'+a+'" '+(String(o.availability||'unknown')===a?'selected':'')+'>'+statusLabel(a)+'</option>').join('')+'</select></td><td>'+(canEdit?'<button class="network-respond-btn" data-offer-save="'+esc(o.id)+'" type="button">Save</button>':'')+'</td></tr>';
  }).join('')||'<tr><td colspan="8">No catalog offers match this search.</td></tr>';
  document.querySelectorAll('[data-offer-save]').forEach(b=>b.onclick=()=>updateOffer(b.dataset.offerSave));
}
function renderInstallerNetwork(){
  const network=data.installer_network||{};
  const code=network.referral_code?.code||'—';
  const referral=network.referral_code?.code?(location.origin+'/?ref='+encodeURIComponent(network.referral_code.code)):'';
  const codeEl=$('#distributorReferralCode'),refEl=$('#distributorReferralLink');
  if(codeEl)codeEl.textContent=code;
  if(refEl)refEl.value=referral;
  const installers=network.installers||[];
  const count=$('#installerNetworkCount');if(count)count.textContent=String(installers.length);
  const rows=$('#installerNetworkRows');
  if(rows)rows.innerHTML=installers.map(x=>'<tr><td><strong>'+esc(x.company_name||'Installer')+'</strong></td><td>'+esc(x.email||'—')+'</td><td>'+esc(statusLabel(x.business_type||'installer'))+'</td><td>'+esc(x.service_area||'—')+'</td><td>'+esc(x.profile_completed?'Complete':'Pending')+'</td><td>'+date(x.created_at)+'</td></tr>').join('')||'<tr><td colspan="6">No installers registered through this distributor yet.</td></tr>';
}
function buildInstallerAccessLink(){
  const network=data.installer_network||{},code=network.referral_code?.code||'';
  const email=String($('#installerInviteEmail')?.value||'').trim();
  const company=String($('#installerInviteCompany')?.value||'').trim();
  const q=new URLSearchParams({signup:'1'});
  if(code)q.set('ref',code);
  if(email)q.set('email',email);
  if(company)q.set('company',company);
  const link=location.origin+'/?'+q.toString();
  const out=$('#installerAccessLink');if(out)out.value=link;
  return link;
}
async function copyTextValue(text){
  if(!text)return;
  try{await navigator.clipboard.writeText(text)}catch{}
}
async function updateOrder(id){
  const btn=document.querySelector('[data-order-save="'+CSS.escape(id)+'"]');
  if(btn){btn.disabled=true;btn.textContent='Saving…'}
  try{
    await api('distributor-update-order',{method:'POST',body:{
      distributor_id:data.membership.distributor_id,
      order_id:id,
      status:document.querySelector('[data-order-status="'+CSS.escape(id)+'"]')?.value,
      delivery_method:document.querySelector('[data-order-method="'+CSS.escape(id)+'"]')?.value,
      scheduled_for:document.querySelector('[data-order-schedule="'+CSS.escape(id)+'"]')?.value||null,
      tracking_reference:document.querySelector('[data-order-track="'+CSS.escape(id)+'"]')?.value||''
    }});
    await load();
  }catch(e){alert(e.message||'Could not update order')}
  finally{if(btn){btn.disabled=false;btn.textContent='Save fulfillment'}}
}
async function updateOffer(id){
  const btn=document.querySelector('[data-offer-save="'+CSS.escape(id)+'"]');
  if(btn){btn.disabled=true;btn.textContent='Saving…'}
  try{
    await api('distributor-update-offer',{method:'POST',body:{
      distributor_id:data.membership.distributor_id,
      offer_id:id,
      price_sqft:Number(document.querySelector('[data-offer-price="'+CSS.escape(id)+'"]')?.value||0),
      stock_sqft:Number(document.querySelector('[data-offer-stock="'+CSS.escape(id)+'"]')?.value||0),
      lead_time_days:Number(document.querySelector('[data-offer-lead="'+CSS.escape(id)+'"]')?.value||0),
      availability:document.querySelector('[data-offer-availability="'+CSS.escape(id)+'"]')?.value||'unknown'
    }});
    await load();activateTab('catalog');
  }catch(e){alert(e.message||'Could not update catalog price')}
  finally{if(btn){btn.disabled=false;btn.textContent='Save'}}
}
function shortId(id){return id?String(id).slice(0,8).toUpperCase():'—'}
function leadEvents(id){return (data.events||[]).filter(x=>x.material_lead_id===id)}
function leadQuotes(id){return (data.quotes||[]).filter(x=>x.material_lead_id===id)}
function leadSupply(id){return (data.supply_requests||[]).filter(x=>x.material_lead_id===id)}
function leadOrders(id){return (data.orders||[]).filter(x=>x.material_lead_id===id)}

function openLead(id){
  const l=(data.leads||[]).find(x=>x.id===id);if(!l)return;currentLead=l;
  $('#drawerTitle').textContent=l.product_name||l.material||'Material request';
  $('#drawerMeta').textContent=(l.product_sku?'SKU '+l.product_sku+' · ':'')+Number(l.required_sqft||0).toLocaleString()+' sqft · '+([l.project_city,l.project_state,l.project_zip].filter(Boolean).join(', ')||'Delivery location pending');
  const latestSupply=leadSupply(id)[0],latestQuote=leadQuotes(id)[0],latestOrder=leadOrders(id)[0];
  const offer=(data.offers||[]).find(o=>o.variant_id===l.catalog_variant_id)||null;
  const stockSqft=Math.max(0,Number(offer?.stock_sqft||0));
  const sqftPerBox=Math.max(0,Number(offer?.catalog_variants?.sqft_per_box||0));
  const shortageSqft=Math.max(0,Number(l.required_sqft||0)-stockSqft);
  const shortageBoxes=shortageSqft>0&&sqftPerBox>0?Math.ceil(shortageSqft/sqftPerBox):(shortageSqft>0?Number(l.calculated_boxes||0):0);
  const inventoryText=offer
    ? 'Distributor stock: '+stockSqft.toLocaleString(undefined,{maximumFractionDigits:2})+' sqft'+(sqftPerBox?' · '+Math.floor(stockSqft/sqftPerBox)+' full boxes':'')+' · Shortage: '+shortageSqft.toLocaleString(undefined,{maximumFractionDigits:2})+' sqft'+(shortageBoxes?' / '+shortageBoxes+' boxes':'')
    : 'No active distributor offer was found for this SKU. Confirm inventory before requesting industry supply.';
  $('#drawerBody').innerHTML='<section class="detail-card"><h3>Opportunity</h3><div class="detail-grid"><div><span>Installer</span><strong>'+esc(l.partners?.company_name||l.requester_company||'—')+'</strong></div><div><span>Customer / requester</span><strong>'+esc(l.requester_name||'—')+'</strong></div><div><span>Project</span><strong>'+esc(l.project_name||'—')+'</strong></div><div><span>Required</span><strong>'+Number(l.required_sqft||0).toLocaleString()+' sqft'+(l.calculated_boxes?' · '+l.calculated_boxes+' boxes':'')+'</strong></div><div><span>Product</span><strong>'+esc([l.product_name,l.product_sku,l.custom_size].filter(Boolean).join(' · ')||l.material)+'</strong></div><div><span>Estimate</span><strong>'+esc(l.estimate_no||'—')+'</strong></div></div></section>'+
  '<section class="detail-card"><h3>Workflow actions</h3><p class="form-message">Current status: <strong>'+esc(statusLabel(l.status))+'</strong>. Use the business action that matches what you are doing; Pristine updates the workflow state for you.</p><div class="action-row workflow-action-row"><button class="btn secondary" data-lead-status="distributor_review" type="button">Start review</button><button class="btn secondary" data-lead-status="quote_ready" type="button">Mark quote ready</button><button class="btn dark" data-lead-status="ordered" type="button">Create order</button><button class="btn dark" data-lead-status="fulfilled" type="button">Mark fulfilled</button><button class="btn secondary" data-lead-status="lost" type="button">Close as lost</button></div><p id="statusMessage" class="form-message"></p></section>'+
  '<section class="detail-card"><h3>Check inventory / request industry</h3><p class="form-message">'+esc(inventoryText)+'</p><p class="form-message">'+(latestSupply?'Latest industry request: '+statusLabel(latestSupply.status)+(latestSupply.response_notes?' · '+esc(latestSupply.response_notes):''):'If stock is insufficient, request only the calculated shortage from the manufacturer.')+'</p><div class="form-grid"><label>Shortage sqft<input id="supplySqft" type="number" min="0" step=".01" value="'+shortageSqft.toFixed(2)+'"></label><label>Boxes<input id="supplyBoxes" type="number" min="0" step="1" value="'+shortageBoxes+'"></label><label class="wide">Notes<textarea id="supplyNotes" rows="3" placeholder="Stock shortage, requested color/lot, delivery constraints…"></textarea></label></div><div class="action-row"><button id="requestSupplyBtn" class="btn secondary" type="button">Request from Industry</button></div><p id="supplyMessage" class="form-message"></p></section>'+
  '<section class="detail-card"><h3>Return quote to installer</h3><p class="form-message">'+(latestQuote?'Latest submitted quote: '+money(latestQuote.total):'Create the material quote that the installer will receive in Pristine.')+'</p><div class="form-grid"><label>Quantity sqft<input id="quoteQty" type="number" min="0" step="1" value="'+Number(l.required_sqft||0)+'"></label><label>Unit price / sqft<input id="quoteUnit" type="number" min="0" step=".01" value="'+Number(l.unit_price_sqft||0)+'"></label><label>Freight<input id="quoteFreight" type="number" min="0" step=".01" value="0"></label><label>Tax<input id="quoteTax" type="number" min="0" step=".01" value="0"></label><label>ETA days<input id="quoteEta" type="number" min="0" step="1"></label><label>Valid through<input id="quoteExpires" type="date"></label><label class="wide">Quote notes<textarea id="quoteNotes" rows="3"></textarea></label></div><div class="action-row"><button id="submitQuoteBtn" class="btn gold" type="button">Submit quote to installer</button></div><p id="quoteMessage" class="form-message"></p></section>'+
  (latestOrder?'<section class="detail-card"><h3>Accepted order</h3><div class="detail-grid"><div><span>Status</span><strong>'+esc(statusLabel(latestOrder.status))+'</strong></div><div><span>Total</span><strong>'+money(latestOrder.total)+'</strong></div><div><span>Fulfillment</span><strong>'+esc(statusLabel(latestOrder.delivery_method))+'</strong></div><div><span>Reference</span><strong>'+esc(latestOrder.tracking_reference||'—')+'</strong></div></div></section>':'')+
  '<section class="detail-card"><h3>Shared timeline</h3><div class="timeline">'+(leadEvents(id).map(e=>'<div class="timeline-item"><strong>'+esc(statusLabel(e.event_type))+'</strong><p>'+esc(e.message||'Network activity')+'</p><small>'+date(e.created_at)+' · '+esc(statusLabel(e.actor_type))+'</small></div>').join('')||'<div class="empty">No network timeline events yet.</div>')+'</div></section>';
  document.querySelectorAll('[data-lead-status]').forEach(btn=>btn.onclick=()=>updateStatus(btn.dataset.leadStatus));$('#requestSupplyBtn').onclick=requestSupply;$('#submitQuoteBtn').onclick=submitQuote;
  $('#opportunityDrawer').classList.remove('hidden');$('#opportunityDrawer').setAttribute('aria-hidden','false');
}
function closeDrawer(){$('#opportunityDrawer').classList.add('hidden');$('#opportunityDrawer').setAttribute('aria-hidden','true');currentLead=null}
$('#closeDrawerBtn').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;

async function updateStatus(status){
  const id=currentLead?.id;if(!id||!status)return;
  try{$('#statusMessage').textContent='Updating…';await api('distributor-update-opportunity',{method:'POST',body:{distributor_id:data.membership.distributor_id,lead_id:id,status}});await load();openLead(id)}catch(e){$('#statusMessage').textContent=e.message}
}
async function requestSupply(){
  const id=currentLead.id;
  try{$('#supplyMessage').textContent='Sending to industry…';await api('distributor-request-supply',{method:'POST',body:{distributor_id:data.membership.distributor_id,lead_id:id,requested_sqft:Number($('#supplySqft').value||0),requested_boxes:Number($('#supplyBoxes').value||0),notes:$('#supplyNotes').value}});await load();openLead(id)}catch(e){$('#supplyMessage').textContent=e.message}
}
async function submitQuote(){
  const id=currentLead.id;
  try{$('#quoteMessage').textContent='Submitting quote…';await api('distributor-submit-quote',{method:'POST',body:{distributor_id:data.membership.distributor_id,lead_id:id,quantity_sqft:Number($('#quoteQty').value||0),unit_price_sqft:Number($('#quoteUnit').value||0),freight:Number($('#quoteFreight').value||0),tax:Number($('#quoteTax').value||0),eta_days:Number($('#quoteEta').value||0),expires_at:$('#quoteExpires').value||null,notes:$('#quoteNotes').value}});await load();openLead(id)}catch(e){$('#quoteMessage').textContent=e.message}
}
$('#statusFilter').onchange=renderOpportunities;
if($('#catalogSearch'))$('#catalogSearch').oninput=renderCatalog;
if($('#generateInstallerLinkBtn'))$('#generateInstallerLinkBtn').onclick=buildInstallerAccessLink;
if($('#copyInstallerLinkBtn'))$('#copyInstallerLinkBtn').onclick=()=>copyTextValue($('#installerAccessLink')?.value||buildInstallerAccessLink());
if($('#copyDistributorReferralBtn'))$('#copyDistributorReferralBtn').onclick=()=>copyTextValue($('#distributorReferralLink')?.value||'');
$('#refreshBtn').onclick=load;$('#signOutBtn').onclick=async()=>{await sb.auth.signOut();location.href='/'};

(async()=>{
  try{const {data:s}=await sb.auth.getSession();session=s.session;if(!session){location.href='/?distributor=1';return}await load()}
  catch(e){$('#accessGate').innerHTML='<div class="gate-card"><p class="eyebrow">DISTRIBUTOR WORKSPACE</p><h1>Access not configured</h1><p>'+esc(e.message||'This Pristine account is not linked to a distributor.')+'</p><a class="btn dark" href="calculator.html">Open Installer Workspace</a></div>'}
})();