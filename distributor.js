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
  renderOpportunities();renderSupply();renderQuotes();renderOrders();renderCatalog();renderInstallerNetwork();renderRewards();
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
function hasPermission(name){return (data.permissions||[]).includes(name)||data.membership?.role==='admin_view'}
function renderCatalog(){
  const body=$('#catalogRows');if(!body)return;
  const role=String(data.membership?.role||'');
  const canEdit=hasPermission('manage_catalog')||hasPermission('manage_pricing')||hasPermission('manage_inventory');
  const note=$('#catalogRoleNote');
  if(note)note.textContent=canEdit?'Owner/manager pricing controls are active.':'Catalog pricing is read-only for your '+statusLabel(role)+' role.';
  const q=String($('#catalogSearch')?.value||'').trim().toLowerCase();
  const offers=(data.offers||[]).filter(o=>{
    const v=o.catalog_variants||{},p=v.catalog_products||{};
    return !q||[v.sku,v.name,v.size,p.collection,p.category].some(x=>String(x||'').toLowerCase().includes(q));
  });
  const industry=new Map((data.industry_inventory||[]).map(x=>[x.variant_id,x]));
  body.innerHTML=offers.map(o=>{
    const v=o.catalog_variants||{},p=v.catalog_products||{},global=industry.get(o.variant_id)||{};
    const disabled=canEdit?'':' disabled';
    return '<tr class="'+(o.active?'':'inactive-row')+'"><td><strong>'+esc(v.name||'Product')+'</strong><small class="table-sub">'+esc(p.collection||'')+'</small></td><td>'+esc(v.sku||'—')+'</td><td>'+esc(v.size||'—')+'</td><td><strong>'+Number(global.on_hand_sqft||0).toLocaleString()+' sqft</strong><small class="table-sub">'+esc(statusLabel(global.availability||'unknown'))+'</small></td><td><input class="network-inline-input" data-offer-price="'+esc(o.id)+'" type="number" min="0" step=".01" value="'+Number(o.price_sqft||0)+'"'+disabled+'></td><td><input class="network-inline-input" data-offer-stock="'+esc(o.id)+'" type="number" min="0" step="1" value="'+Number(o.stock_sqft||0)+'"'+disabled+'></td><td><input class="network-inline-input" data-offer-lead="'+esc(o.id)+'" type="number" min="0" step="1" value="'+Number(o.lead_time_days||0)+'"'+disabled+'></td><td><select class="network-status-select" data-offer-availability="'+esc(o.id)+'"'+disabled+'>'+['in_stock','limited','special_order','out_of_stock','unknown'].map(a=>'<option value="'+a+'" '+(String(o.availability||'unknown')===a?'selected':'')+'>'+statusLabel(a)+'</option>').join('')+'</select></td><td><input data-offer-active="'+esc(o.id)+'" type="checkbox" '+(o.active?'checked':'')+disabled+'></td><td>'+(canEdit?'<button class="network-respond-btn" data-offer-save="'+esc(o.id)+'" type="button">Save</button>':'')+'</td></tr>';
  }).join('')||'<tr><td colspan="10">No catalog offers match this search.</td></tr>';
  document.querySelectorAll('[data-offer-save]').forEach(b=>b.onclick=()=>updateOffer(b.dataset.offerSave));
  const add=$('#catalogAddVariant');
  if(add){
    const existing=new Set((data.offers||[]).map(o=>o.variant_id));
    add.innerHTML='<option value="">Add product from Industry catalog…</option>'+(data.catalog||[]).filter(v=>!existing.has(v.id)).map(v=>'<option value="'+esc(v.id)+'">'+esc(v.sku+' · '+v.name+' · '+(v.size||''))+'</option>').join('');
    add.disabled=!hasPermission('manage_catalog');
  }
  const addBtn=$('#catalogAddBtn');if(addBtn)addBtn.disabled=!hasPermission('manage_catalog');
}
function renderInstallerNetwork(){
  const network=data.installer_network||{};
  const code=network.referral_code?.code||'—';
  const referral=network.referral_code?.code?(location.origin+'/?ref='+encodeURIComponent(network.referral_code.code)):'';
  const codeEl=$('#distributorReferralCode'),refEl=$('#distributorReferralLink');
  if(codeEl)codeEl.textContent=code;if(refEl)refEl.value=referral;
  const installers=network.installers||[],canManage=hasPermission('manage_installers');
  const count=$('#installerNetworkCount');if(count)count.textContent=String(installers.length);
  const rows=$('#installerNetworkRows');
  if(rows)rows.innerHTML=installers.map(x=>{
    const statusSelect=canManage?'<select data-installer-status="'+esc(x.partner_id)+'">'+['active','suspended','removed'].map(s=>'<option value="'+s+'" '+(x.status===s?'selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select>':'<span class="status '+esc(x.status)+'">'+esc(statusLabel(x.status))+'</span>';
    const actions=canManage?'<div class="installer-actions"><button data-installer-save="'+esc(x.partner_id)+'" class="network-respond-btn" type="button">Save</button><button data-installer-points="'+esc(x.partner_id)+'" class="btn secondary mini" type="button">± Points</button></div>':'—';
    return '<tr><td><strong>'+esc(x.company_name||'Installer')+'</strong><small class="table-sub">'+esc(x.business_type||'')+'</small></td><td>'+esc(x.email||'—')+'</td><td>'+esc(x.service_area||'—')+'</td><td>'+statusSelect+'</td><td><strong>'+Number(x.points_balance||0).toLocaleString()+'</strong></td><td>'+date(x.created_at)+'</td><td>'+actions+'</td></tr>';
  }).join('')||'<tr><td colspan="7">No installers registered through this distributor yet.</td></tr>';
  document.querySelectorAll('[data-installer-save]').forEach(b=>b.onclick=()=>updateInstallerStatus(b.dataset.installerSave));
  document.querySelectorAll('[data-installer-points]').forEach(b=>b.onclick=()=>adjustInstallerPoints(b.dataset.installerPoints));
}
function toLocalInput(v){if(!v)return '';const d=new Date(v);const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())}
function rewardTypeLabel(v){return statusLabel(v||'custom')}
function renderRewards(){
  const rewards=data.rewards||{},program=rewards.program||{},canManage=hasPermission('manage_rewards');
  const set=(id,val)=>{const el=$(id);if(el)el.value=val??''};
  set('#rewardProgramName',program.program_name||'Pristine Points');
  set('#rewardPointsLabel',program.points_label||'Points');
  set('#rewardPointsPerDollar',Number(program.points_per_dollar??1));
  set('#rewardEarnBasis',program.earn_basis||'subtotal');
  set('#rewardMinimumPurchase',Number(program.minimum_purchase||0));
  set('#rewardExpirationMonths',program.expiration_months||'');
  set('#rewardTerms',program.terms||'');
  const active=$('#rewardProgramActive');if(active)active.checked=Boolean(program.active);
  const status=$('#rewardProgramStatus');if(status){status.textContent=program.active?'Enabled':'Disabled';status.className='status '+(program.active?'reward-program-on':'reward-program-off')}
  ['#rewardProgramName','#rewardPointsLabel','#rewardPointsPerDollar','#rewardEarnBasis','#rewardMinimumPurchase','#rewardExpirationMonths','#rewardTerms','#rewardProgramActive','#saveRewardProgramBtn','#newRewardLabel','#newRewardType','#newRewardPoints','#newRewardValue','#newRewardDescription','#newRewardActive','#addRewardBtn','#newCampaignName','#newCampaignType','#newCampaignMultiplier','#newCampaignBonus','#newCampaignMinimum','#newCampaignVariant','#newCampaignStarts','#newCampaignEnds','#newCampaignActive','#addCampaignBtn'].forEach(s=>{const el=$(s);if(el)el.disabled=!canManage});

  const rows=$('#rewardCatalogRows');
  if(rows)rows.innerHTML=(rewards.catalog||[]).map(r=>{
    const disabled=canManage?'':' disabled';
    return '<tr><td><input class="reward-catalog-name" data-reward-label="'+esc(r.id)+'" value="'+esc(r.label)+'"'+disabled+'><small class="table-sub">'+esc(r.description||'')+'</small></td><td><select data-reward-type="'+esc(r.id)+'"'+disabled+'>'+['store_credit','cash_equivalent','free_delivery','product','service','custom'].map(t=>'<option value="'+t+'" '+(r.reward_type===t?'selected':'')+'>'+rewardTypeLabel(t)+'</option>').join('')+'</select></td><td><input class="reward-points-input" data-reward-points="'+esc(r.id)+'" type="number" min="1" step="1" value="'+Number(r.points_cost||0)+'"'+disabled+'></td><td><input class="reward-value-input" data-reward-value="'+esc(r.id)+'" type="number" min="0" step=".01" value="'+(r.reward_value??'')+'"'+disabled+'></td><td><input data-reward-active="'+esc(r.id)+'" type="checkbox" '+(r.active?'checked':'')+disabled+'></td><td>'+(canManage?'<button class="network-respond-btn" data-reward-save="'+esc(r.id)+'" type="button">Save</button>':'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="6">No rewards configured.</td></tr>';
  document.querySelectorAll('[data-reward-save]').forEach(b=>b.onclick=()=>saveRewardRow(b.dataset.rewardSave));

  const variant=$('#newCampaignVariant');
  if(variant)variant.innerHTML='<option value="">All products</option>'+(data.catalog||[]).map(v=>'<option value="'+esc(v.id)+'">'+esc(v.sku+' · '+v.name+' · '+(v.size||''))+'</option>').join('');

  const campaignRows=$('#rewardCampaignRows');
  if(campaignRows)campaignRows.innerHTML=(rewards.campaigns||[]).map(x=>{
    const rule=x.campaign_type==='multiplier'?(Number(x.multiplier||1)+'× points'):(Number(x.bonus_points||0).toLocaleString()+' bonus points');
    const product=x.catalog_variants?((x.catalog_variants.sku||'')+' · '+(x.catalog_variants.name||'')):'All products';
    const window=[x.starts_at?date(x.starts_at):'Any time',x.ends_at?date(x.ends_at):'No end'].join(' → ');
    const disabled=canManage?'':' disabled';
    return '<tr><td><input data-campaign-name="'+esc(x.id)+'" value="'+esc(x.name)+'"'+disabled+'></td><td><span class="reward-rule-badge">'+esc(rule)+'</span></td><td>'+esc(product)+'</td><td>'+esc(window)+'</td><td><input data-campaign-active="'+esc(x.id)+'" type="checkbox" '+(x.active?'checked':'')+disabled+'></td><td>'+(canManage?'<button class="network-respond-btn" data-campaign-save="'+esc(x.id)+'" type="button">Save</button>':'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="6">No campaigns configured.</td></tr>';
  document.querySelectorAll('[data-campaign-save]').forEach(b=>b.onclick=()=>saveCampaignRow(b.dataset.campaignSave));

  const redemptionRows=$('#rewardRedemptionRows');
  if(redemptionRows)redemptionRows.innerHTML=(rewards.redemptions||[]).map(r=>{
    const installer=r.partners?.company_name||r.partners?.email||'Installer';
    const closed=['fulfilled','cancelled'].includes(r.status);
    const action=canManage&&!closed?'<select data-redemption-status="'+esc(r.id)+'"><option value="approved" '+(r.status==='approved'?'selected':'')+'>Approve</option><option value="fulfilled">Fulfill</option><option value="cancelled">Cancel & refund</option></select><button class="network-respond-btn" data-redemption-save="'+esc(r.id)+'" type="button">Update</button>':'—';
    return '<tr><td>'+date(r.requested_at)+'</td><td>'+esc(installer)+'</td><td>'+esc(r.reward_label)+'</td><td>'+Number(r.points||0).toLocaleString()+'</td><td><span class="status '+esc(r.status)+'">'+esc(statusLabel(r.status))+'</span></td><td><div class="installer-actions">'+action+'</div></td></tr>';
  }).join('')||'<tr><td colspan="6">No redemption requests yet.</td></tr>';
  document.querySelectorAll('[data-redemption-save]').forEach(b=>b.onclick=()=>updateRewardRedemption(b.dataset.redemptionSave));
}
async function saveRewardProgram(){
  const msg=$('#rewardProgramMessage');if(msg)msg.textContent='Saving…';
  try{
    await api('distributor-save-reward-program',{method:'POST',body:{
      distributor_id:data.membership.distributor_id,program_name:$('#rewardProgramName').value,points_label:$('#rewardPointsLabel').value,
      points_per_dollar:Number($('#rewardPointsPerDollar').value||0),earn_basis:$('#rewardEarnBasis').value,
      minimum_purchase:Number($('#rewardMinimumPurchase').value||0),expiration_months:$('#rewardExpirationMonths').value||null,
      active:$('#rewardProgramActive').checked,terms:$('#rewardTerms').value
    }});
    if(msg)msg.textContent='Program saved.';await load();activateTab('rewards');
  }catch(e){if(msg)msg.textContent=e.message}
}
async function addReward(){
  const msg=$('#newRewardMessage');if(msg)msg.textContent='Saving…';
  try{
    await api('distributor-save-reward-item',{method:'POST',body:{
      distributor_id:data.membership.distributor_id,label:$('#newRewardLabel').value,reward_type:$('#newRewardType').value,
      points_cost:Number($('#newRewardPoints').value||0),reward_value:$('#newRewardValue').value,
      description:$('#newRewardDescription').value,active:$('#newRewardActive').checked
    }});
    ['#newRewardLabel','#newRewardPoints','#newRewardValue','#newRewardDescription'].forEach(s=>$(s).value='');
    if(msg)msg.textContent='Reward added.';await load();activateTab('rewards');
  }catch(e){if(msg)msg.textContent=e.message}
}
async function saveRewardRow(id){
  const current=(data.rewards?.catalog||[]).find(x=>x.id===id)||{};
  await api('distributor-save-reward-item',{method:'POST',body:{
    distributor_id:data.membership.distributor_id,id,
    label:document.querySelector('[data-reward-label="'+CSS.escape(id)+'"]')?.value,
    reward_type:document.querySelector('[data-reward-type="'+CSS.escape(id)+'"]')?.value,
    points_cost:Number(document.querySelector('[data-reward-points="'+CSS.escape(id)+'"]')?.value||0),
    reward_value:document.querySelector('[data-reward-value="'+CSS.escape(id)+'"]')?.value,
    description:current.description||'',active:Boolean(document.querySelector('[data-reward-active="'+CSS.escape(id)+'"]')?.checked),
    sort_order:current.sort_order||0
  }});
  await load();activateTab('rewards');
}
async function addCampaign(){
  const msg=$('#newCampaignMessage');if(msg)msg.textContent='Saving…';
  try{
    await api('distributor-save-reward-campaign',{method:'POST',body:{
      distributor_id:data.membership.distributor_id,name:$('#newCampaignName').value,campaign_type:$('#newCampaignType').value,
      multiplier:Number($('#newCampaignMultiplier').value||1),bonus_points:Number($('#newCampaignBonus').value||0),
      minimum_purchase:Number($('#newCampaignMinimum').value||0),variant_id:$('#newCampaignVariant').value||null,
      starts_at:$('#newCampaignStarts').value?new Date($('#newCampaignStarts').value).toISOString():null,
      ends_at:$('#newCampaignEnds').value?new Date($('#newCampaignEnds').value).toISOString():null,active:$('#newCampaignActive').checked
    }});
    if(msg)msg.textContent='Campaign added.';await load();activateTab('rewards');
  }catch(e){if(msg)msg.textContent=e.message}
}
async function saveCampaignRow(id){
  const current=(data.rewards?.campaigns||[]).find(x=>x.id===id);if(!current)return;
  await api('distributor-save-reward-campaign',{method:'POST',body:{
    distributor_id:data.membership.distributor_id,id,name:document.querySelector('[data-campaign-name="'+CSS.escape(id)+'"]')?.value||current.name,
    campaign_type:current.campaign_type,multiplier:current.multiplier,bonus_points:current.bonus_points,
    minimum_purchase:current.minimum_purchase,variant_id:current.variant_id,starts_at:current.starts_at,ends_at:current.ends_at,
    active:Boolean(document.querySelector('[data-campaign-active="'+CSS.escape(id)+'"]')?.checked)
  }});
  await load();activateTab('rewards');
}
async function updateRewardRedemption(id){
  const status=document.querySelector('[data-redemption-status="'+CSS.escape(id)+'"]')?.value;if(!status)return;
  await api('distributor-update-reward-redemption',{method:'POST',body:{distributor_id:data.membership.distributor_id,redemption_id:id,status}});
  await load();activateTab('rewards');
}

async function buildInstallerAccessLink(){
  const email=String($('#installerInviteEmail')?.value||'').trim(),company=String($('#installerInviteCompany')?.value||'').trim();
  const d=await api('distributor-create-installer-invite',{method:'POST',body:{distributor_id:data.membership.distributor_id,email,company}});
  const q=new URLSearchParams({signup:'1',invite:d.invite.invite_token});
  if(d.referral_code)q.set('ref',d.referral_code);if(email)q.set('email',email);if(company)q.set('company',company);
  const link=location.origin+'/?'+q.toString();const out=$('#installerAccessLink');if(out)out.value=link;return link;
}
async function updateInstallerStatus(partnerId){
  const status=document.querySelector('[data-installer-status="'+CSS.escape(partnerId)+'"]')?.value||'active';
  await api('distributor-update-installer',{method:'POST',body:{distributor_id:data.membership.distributor_id,partner_id:partnerId,status}});
  await load();activateTab('installers');
}
async function adjustInstallerPoints(partnerId){
  const raw=prompt('Points adjustment. Use a positive number to add points or a negative number to remove points:','100');
  if(raw===null)return;const points=Math.trunc(Number(raw));if(!points)return alert('Enter a non-zero points amount.');
  const description=prompt('Reason / description:','Referral reward')||'Distributor points adjustment';
  await api('distributor-adjust-points',{method:'POST',body:{distributor_id:data.membership.distributor_id,partner_id:partnerId,points,description}});
  await load();activateTab('installers');
}
async function addCatalogProduct(){
  const variantId=$('#catalogAddVariant')?.value;if(!variantId)return;
  await api('distributor-add-offer',{method:'POST',body:{distributor_id:data.membership.distributor_id,variant_id:variantId,price_sqft:0,stock_sqft:0,lead_time_days:0,availability:'unknown'}});
  await load();activateTab('catalog');
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
      availability:document.querySelector('[data-offer-availability="'+CSS.escape(id)+'"]')?.value||'unknown',
      active:Boolean(document.querySelector('[data-offer-active="'+CSS.escape(id)+'"]')?.checked)
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
if($('#generateInstallerLinkBtn'))$('#generateInstallerLinkBtn').onclick=async()=>{try{await buildInstallerAccessLink()}catch(e){alert(e.message||'Could not create installer access link')}};
if($('#copyInstallerLinkBtn'))$('#copyInstallerLinkBtn').onclick=async()=>{try{let v=$('#installerAccessLink')?.value;if(!v)v=await buildInstallerAccessLink();await copyTextValue(v)}catch(e){alert(e.message||'Could not copy installer access link')}};
if($('#catalogAddBtn'))$('#catalogAddBtn').onclick=async()=>{try{await addCatalogProduct()}catch(e){alert(e.message||'Could not add product')}};
if($('#copyDistributorReferralBtn'))$('#copyDistributorReferralBtn').onclick=()=>copyTextValue($('#distributorReferralLink')?.value||'');
if($('#saveRewardProgramBtn'))$('#saveRewardProgramBtn').onclick=saveRewardProgram;
if($('#addRewardBtn'))$('#addRewardBtn').onclick=addReward;
if($('#addCampaignBtn'))$('#addCampaignBtn').onclick=addCampaign;
$('#refreshBtn').onclick=load;$('#signOutBtn').onclick=async()=>{await sb.auth.signOut();location.href='/'};

(async()=>{
  try{const {data:s}=await sb.auth.getSession();session=s.session;if(!session){location.href='/?distributor=1';return}await load()}
  catch(e){$('#accessGate').innerHTML='<div class="gate-card"><p class="eyebrow">DISTRIBUTOR WORKSPACE</p><h1>Access not configured</h1><p>'+esc(e.message||'This Pristine account is not linked to a distributor.')+'</p><a class="btn dark" href="calculator.html">Open Installer Workspace</a></div>'}
})();