const PRISTINE_API='https://lueomnmkbbrllxbnpxph.supabase.co/functions/v1/pristine-api';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const num=v=>Math.max(0,Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DOC_KEY='pristine_workspace_docs_v3', BRAND_KEY='pristine_partner_brand_v3', LEAD_KEY='pristine_material_leads_v1', PRO_TOKEN_KEY='pristine_pro_token_v1';
const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const sb=window.supabase?.createClient?window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let currentSession=null,currentPartner=null,currentPartnerProfile=null,currentReferralCode=null,cloudSyncBusy=false;
function apiHeaders(json=true){const h={};if(json)h['content-type']='application/json';if(currentSession?.access_token)h.Authorization='Bearer '+currentSession.access_token;return h}
function workspaceSuffix(){return currentSession?.user?.id?':'+currentSession.user.id:':guest'}
function workspaceKey(base){return base+workspaceSuffix()}
function loadWorkspaceJSON(base,fallback){try{return JSON.parse(localStorage.getItem(workspaceKey(base))||JSON.stringify(fallback))}catch{return fallback}}
function saveWorkspaceJSON(base,value){try{localStorage.setItem(workspaceKey(base),JSON.stringify(value))}catch{}}
function setAccountMessage(message,isError=false){const el=$('#accountMessage');if(!el)return;el.textContent=message||'';el.classList.toggle('error',!!isError)}
async function fetchCurrentPartner(){
  if(!sb||!currentSession?.user)return null;
  const {data,error}=await sb.from('partners').select('*').eq('owner_id',currentSession.user.id).maybeSingle();
  if(error){console.error(error);return null}
  currentPartner=data||null; return currentPartner
}

function partnerBusinessLabel(value){
  const labels={
    installer:'Installer',
    flooring_contractor:'Flooring contractor',
    general_contractor:'General contractor',
    remodeler:'Remodeler',
    retailer:'Retailer',
    designer:'Designer',
    property_manager:'Property manager',
    other:'Other'
  };
  return labels[value]||'Complete your Partner Profile';
}

async function fetchPartnerNetworkData(promptProfile=false){
  if(!sb||!currentPartner)return null;
  try{
    await fetch(PRISTINE_API+'?action=ensure-partner-network',{method:'POST',headers:apiHeaders(),body:'{}'});
  }catch{}
  const [profileR,codeR,eventsR]=await Promise.all([
    sb.from('partner_profiles').select('*').eq('partner_id',currentPartner.id).maybeSingle(),
    sb.from('referral_codes').select('id,code,active,created_at').eq('partner_id',currentPartner.id).eq('active',true).maybeSingle(),
    sb.from('referral_events').select('event_type,created_at').eq('partner_id',currentPartner.id)
  ]);
  if(profileR.error)console.error(profileR.error);
  if(codeR.error)console.error(codeR.error);
  if(eventsR.error)console.error(eventsR.error);
  currentPartnerProfile=profileR.data||null;
  currentReferralCode=codeR.data||null;
  renderPartnerCenter(eventsR.data||[]);
  if(promptProfile && currentPartnerProfile && !currentPartnerProfile.profile_completed){
    const key='pristine_partner_profile_prompted:'+currentPartner.id;
    if(!sessionStorage.getItem(key)){
      sessionStorage.setItem(key,'1');
      setTimeout(()=>openPartnerProfile(),650);
    }
  }
  return {profile:currentPartnerProfile,code:currentReferralCode,events:eventsR.data||[]};
}

function renderPartnerCenter(events=[]){
  const code=currentReferralCode?.code||'—';
  const link=currentReferralCode?.code?(location.origin+'/?ref='+encodeURIComponent(currentReferralCode.code)):'';
  const codeEl=$('#partnerCode'),linkEl=$('#partnerReferralLink'),typeEl=$('#partnerBusinessType');
  if(codeEl)codeEl.textContent=code;
  if(linkEl)linkEl.value=link;
  if(typeEl)typeEl.textContent=currentPartnerProfile?.profile_completed
    ? partnerBusinessLabel(currentPartnerProfile.business_type)+(currentPartnerProfile.service_area?' · '+currentPartnerProfile.service_area:'')
    : 'Complete your profile to personalize the network.';
  const count=t=>events.filter(e=>e.event_type===t).length;
  const opp=count('material_opportunity')+count('material_already_purchased');
  const map={
    partnerMetricOpportunities:opp,
    partnerMetricQuotes:count('quote_requested'),
    partnerMetricReferrals:count('customer_referred'),
    partnerMetricPurchased:count('material_already_purchased')
  };
  Object.entries(map).forEach(([id,v])=>{const el=$('#'+id);if(el)el.textContent=String(v)});
}

function openPartnerProfile(){
  if(!currentPartner)return;
  const p=currentPartnerProfile||{};
  $('#partnerBusinessTypeInput').value=p.business_type||'';
  $('#partnerPurchaseFrequency').value=p.material_purchase_frequency||'';
  $('#partnerUsualBuyer').value=p.usual_material_buyer||'';
  $('#partnerReferralInterest').value=p.referral_interest||'';
  $('#partnerServiceArea').value=p.service_area||'';
  $('#partnerProfileMessage').textContent='';
  $('#partnerProfileDialog')?.showModal();
}

async function savePartnerProfile(){
  if(!currentPartner)return;
  const row={
    partner_id:currentPartner.id,
    business_type:$('#partnerBusinessTypeInput').value||null,
    material_purchase_frequency:$('#partnerPurchaseFrequency').value||null,
    usual_material_buyer:$('#partnerUsualBuyer').value||null,
    referral_interest:$('#partnerReferralInterest').value||null,
    service_area:$('#partnerServiceArea').value.trim()||null,
    profile_completed:Boolean($('#partnerBusinessTypeInput').value&&$('#partnerPurchaseFrequency').value&&$('#partnerUsualBuyer').value),
    updated_at:new Date().toISOString()
  };
  if(!row.profile_completed){
    $('#partnerProfileMessage').textContent='Select business type, purchase frequency and usual material buyer.';
    $('#partnerProfileMessage').classList.add('error');
    return;
  }
  $('#partnerProfileMessage').classList.remove('error');
  $('#partnerProfileMessage').textContent='Saving...';
  const {data,error}=await sb.from('partner_profiles').upsert(row,{onConflict:'partner_id'}).select('*').single();
  if(error){
    $('#partnerProfileMessage').textContent=error.message;
    $('#partnerProfileMessage').classList.add('error');
    return;
  }
  currentPartnerProfile=data;
  try{
    await fetch(PRISTINE_API+'?action=partner-profile-completed',{method:'POST',headers:apiHeaders(),body:'{}'});
  }catch{}
  await fetchPartnerNetworkData(false);
  $('#partnerProfileMessage').textContent='Partner Profile saved.';
  setTimeout(()=>$('#partnerProfileDialog')?.close(),450);
}

async function copyPartnerReferralLink(){
  const value=$('#partnerReferralLink')?.value||'';
  if(!value)return;
  try{
    await navigator.clipboard.writeText(value);
    const btn=$('#copyReferralLinkBtn');if(btn){const old=btn.textContent;btn.textContent='Copied';setTimeout(()=>btn.textContent=old,1200)}
  }catch{
    const input=$('#partnerReferralLink');input?.select();document.execCommand?.('copy');
  }
}
function updateAccountUI(){
  const signed=Boolean(currentSession?.user);
  const email=currentSession?.user?.email||'';
  const company=currentPartner?.company_name||currentSession?.user?.user_metadata?.company_name||'';
  const title=$('#accountStatusTitle'),text=$('#accountStatusText'),bar=$('#accountStatusBar'),btn=$('#accountBtn'),statusBtn=$('#accountStatusBtn');
  if(title)title.textContent=signed?(company||'Company workspace'):'Account required';
  if(text)text.textContent=signed?('Synced securely for '+(company||email)+'.'):'Sign in from the landing page to access the estimator.';
  if(bar){bar.classList.toggle('guest',!signed);bar.classList.toggle('signed-in',signed)}
  if(btn)btn.textContent=signed?(company||'Account'):'Sign in';
  if(statusBtn)statusBtn.textContent=signed?'Manage account':'Sign in / Create account';
  const mode=$('#workspaceModeLabel'),modeText=$('#workspaceModeText');
  if(mode)mode.textContent='CLOUD WORKSPACE';
  if(modeText)modeText.textContent='Your documents are isolated by company and synced to the cloud.';
  const out=$('#signOutBtn');if(out)out.classList.toggle('hidden',!signed);
}
async function signUpAccount(){
  if(!sb)return setAccountMessage('Account service unavailable.',true);
  const company=$('#accountCompany').value.trim(),email=$('#accountEmail').value.trim(),password=$('#accountPassword').value;
  if(!company||!email||password.length<6)return setAccountMessage('Enter company name, valid email and a password with at least 6 characters.',true);
  setAccountMessage('Creating account...');
  const redirectTo=new URL('calculator.html',location.href).href;
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{company_name:company},emailRedirectTo:redirectTo}});
  if(error)return setAccountMessage(error.message,true);
  if(data.session){currentSession=data.session;await fetchCurrentPartner();await syncCloudDocuments(true);updateAccountUI();$('#accountDialog')?.close();setAccountMessage('')}
  else setAccountMessage('Account created. Check your email to confirm, then sign in.');
}
async function signInAccount(){
  if(!sb)return setAccountMessage('Account service unavailable.',true);
  const email=$('#accountEmail').value.trim(),password=$('#accountPassword').value;
  if(!email||!password)return setAccountMessage('Enter your email and password.',true);
  setAccountMessage('Signing in...');
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error)return setAccountMessage(error.message,true);
  currentSession=data.session;await fetchCurrentPartner();await syncCloudDocuments(true);updateAccountUI();$('#accountDialog')?.close();setAccountMessage('');
}
async function signOutAccount(){
  if(!sb)return;
  await sb.auth.signOut(); currentSession=null;currentPartner=null;updateAccountUI();renderSaved();$('#accountDialog')?.close();
}
async function requestAccountPasswordReset(){
  if(!sb)return;
  const email=($('#accountEmail')?.value||currentSession?.user?.email||'').trim();
  if(!email)return setAccountMessage('Enter your email address first.',true);
  setAccountMessage('Sending reset link...');
  const redirectTo=new URL('calculator.html?reset=1',location.href).href;
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)return setAccountMessage(error.message,true);
  setAccountMessage('Password reset email sent. Check your inbox.');
}
async function saveNewAccountPassword(){
  const p=$('#newAccountPassword')?.value||'',c=$('#confirmAccountPassword')?.value||'',m=$('#resetPasswordMessage');
  if(p.length<6||p!==c){if(m){m.textContent='Passwords must match and contain at least 6 characters.';m.classList.add('error')}return}
  const {error}=await sb.auth.updateUser({password:p});
  if(error){if(m){m.textContent=error.message;m.classList.add('error')}return}
  if(m){m.textContent='Password updated successfully.';m.classList.remove('error')}
  history.replaceState({},'',location.pathname);
  setTimeout(()=>$('#resetPasswordDialog')?.close(),500);
}
function openAccountDialog(){
  const signed=Boolean(currentSession?.user),dlg=$('#accountDialog');if(!dlg)return;
  $('#accountEmail').value=currentSession?.user?.email||'';
  $('#accountCompany').value=currentPartner?.company_name||currentSession?.user?.user_metadata?.company_name||'';
  $('#accountPassword').value='';
  $('#signInBtn').classList.toggle('hidden',signed);$('#signUpBtn').classList.toggle('hidden',signed);$('#signOutBtn').classList.toggle('hidden',!signed);
  setAccountMessage(signed?'Signed in as '+(currentSession.user.email||'')+'.':'');
  dlg.showModal();
}
async function persistPartnerBrand(){
  if(!sb||!currentSession?.user||!currentPartner)return;
  const b=loadBrand();
  const {error}=await sb.from('partners').update({company_name:b.name||currentPartner.company_name||'',email:b.email||currentPartner.email||currentSession.user.email||'',phone:b.phone||null,address:b.address||null,license:b.license||null,updated_at:new Date().toISOString()}).eq('id',currentPartner.id);
  if(!error){currentPartner={...currentPartner,company_name:b.name||currentPartner.company_name,email:b.email||currentPartner.email,phone:b.phone,address:b.address,license:b.license};updateAccountUI()}
}
async function upsertCloudDocument(record){
  if(!sb||!currentSession?.user||!currentPartner||!record)return;
  const row={partner_id:currentPartner.id,client_document_id:record.localId||record.id||record.documentNo,document_no:record.documentNo||'',document_type:record.type==='INVOICE'?'INVOICE':'ESTIMATE',status:'draft',project_name:record.client?.project||null,project_address:record.client?.address||null,payload:record,total:Number(record.total||0),updated_at:new Date().toISOString()};
  const {error}=await sb.from('documents').upsert(row,{onConflict:'partner_id,client_document_id'});
  if(error)console.error('Cloud sync failed',error);
}
async function syncCloudDocuments(preferCloud=false){
  if(!sb||!currentSession?.user||!currentPartner||cloudSyncBusy)return;
  cloudSyncBusy=true;
  try{
    const {data,error}=await sb.from('documents').select('client_document_id,payload,updated_at,created_at').eq('partner_id',currentPartner.id).order('created_at',{ascending:false});
    if(error)throw error;
    const local=loadDocs();
    const byId=new Map(local.map(d=>[d.localId||d.id||d.documentNo,d]));
    for(const row of (data||[])){
      const d=normalizeSavedDoc(row.payload||{}); const key=row.client_document_id||d.localId||d.documentNo;
      if(!key)continue;
      d.localId=key; d.cloudUpdatedAt=row.updated_at;
      const existing=byId.get(key);
      if(!existing||preferCloud||new Date(row.updated_at||0)>=new Date(existing.savedAt||0))byId.set(key,d);
    }
    const merged=[...byId.values()].sort((a,b)=>new Date(b.savedAt||b.cloudUpdatedAt||0)-new Date(a.savedAt||a.cloudUpdatedAt||0));
    saveWorkspaceJSON(DOC_KEY,merged); renderSaved();
    for(const d of merged){ if(!(data||[]).some(r=>(r.client_document_id||'')===(d.localId||d.id||d.documentNo))) await upsertCloudDocument(d); }
  }catch(e){console.error('Workspace sync error',e)}finally{cloudSyncBusy=false}
}
async function initAccount(){
  if(!sb){updateAccountUI();return}
  const {data}=await sb.auth.getSession();currentSession=data.session||null;
  if(!currentSession){location.replace('/?signin=1');return false}
  await fetchCurrentPartner();await fetchPartnerNetworkData(true);await syncCloudDocuments(true);
  updateAccountUI();
  const q=new URLSearchParams(location.search);
  if(q.get('reset')==='1'&&currentSession){setTimeout(()=>$('#resetPasswordDialog')?.showModal(),150)}
  sb.auth.onAuthStateChange(async(_event,session)=>{currentSession=session||null;if(currentSession){await fetchCurrentPartner();await fetchPartnerNetworkData(false);await syncCloudDocuments(true);updateAccountUI();renderSaved()}else{currentPartner=null;currentPartnerProfile=null;currentReferralCode=null;location.replace('/?signin=1')}});
}

let proVerified=false;
function proTokenKey(){return PRO_TOKEN_KEY+(currentSession?.user?.id?':'+currentSession.user.id:'')}
function getProToken(){try{return localStorage.getItem(proTokenKey())||''}catch{return''}}
function setProToken(v){try{if(v)localStorage.setItem(proTokenKey(),v);else localStorage.removeItem(proTokenKey())}catch{}}
async function verifyPro(){
  const token=getProToken();
  try{
    const r=await fetch(PRISTINE_API+'?action=pro-status',{method:'POST',headers:apiHeaders(),body:JSON.stringify({pro_token:token})});
    const d=await r.json();
    proVerified=Boolean(r.ok&&d.ok&&d.active);
    if(!proVerified)setProToken('');
    return proVerified;
  }catch{proVerified=false;return false}
}
async function requirePro(feature,onAllowed){
  if(proVerified||await verifyPro()){if(typeof onAllowed==='function')await onAllowed();return true}
  openPro(feature);return false
}
const patterns=['Straight','Staggered','Diagonal 45°','Herringbone','Chevron','Modular','Custom'];
const patternSurcharges={'Straight':0,'Staggered':5,'Diagonal 45°':10,'Herringbone':20,'Chevron':20,'Modular':10,'Custom':0};
const materials=['Material not included','Ceramic / porcelain','Large-format porcelain','Click-lock laminate','Luxury vinyl plank (LVP)','Engineered wood · floating','Engineered wood · glued','Solid hardwood','Carpet','Marble floor tile','Marble wall tile','Wall tile','Customer supplied / Other'];
const catalog=[
 ['Preparation & removal','Floor removal / demolition','sqft',1.25,2.50],['Preparation & removal','Thinset / adhesive removal','sqft',1.00,2.00],['Preparation & removal','Debris disposal','flat',150,300],['Preparation & removal','Final cleaning','flat',100,225],['Preparation & removal','Localized floor prep / patching','sqft',0.75,1.50],['Preparation & removal','Self-leveling compound','sqft',1.50,3.00],['Preparation & removal','Grinding','sqft',1.00,2.25],['Preparation & removal','Mortar bed','sqft',2.50,5.00],['Preparation & removal','Crack isolation membrane','sqft',1.00,2.00],['Preparation & removal','Sound-control membrane','sqft',1.25,2.50],['Preparation & removal','Moisture barrier','sqft',0.85,1.75],['Preparation & removal','Waterproofing membrane','sqft',1.50,3.00],['Preparation & removal','Uncoupling membrane','sqft',1.50,3.00],
 ['Installation extras','Pattern upgrade','sqft',0.50,1.00],['Installation extras','Large-format tile handling','sqft',0.75,1.50],['Installation extras','Underlayment installation','sqft',0.60,1.25],['Installation extras','Grout / sealing','sqft',0.50,1.00],['Installation extras','Tile leveling system','sqft',0.30,0.75],
 ['Finish carpentry','Baseboard removal','lf',0.50,1.25],['Finish carpentry','Baseboard installation','lf',1.25,2.75],['Finish carpentry','Quarter round / shoe molding','lf',0.80,1.75],['Finish carpentry','Transitions / reducers','each',20,45],['Finish carpentry','Door trim undercut','each',12,30],
 ['Specialty areas','Stairs','each',45,95],['Specialty areas','Stair nose installation','each',35,75],['Specialty areas','Shower wall tile','sqft',5.00,10.00],['Specialty areas','Shower floor tile','sqft',6.00,12.00],['Specialty areas','Backsplash installation','sqft',4.00,8.00],['Specialty areas','Wall tile installation','sqft',5.00,10.00],['Specialty areas','Fireplace surround tile','sqft',6.00,12.00],
 ['Jobsite & logistics','Furniture moving','room',40,85],['Jobsite & logistics','Appliance moving','each',25,60],['Jobsite & logistics','Toilet remove & reset','each',75,165],['Jobsite & logistics','Vanity remove & reset','each',100,225],['Jobsite & logistics','Jobsite protection','flat',75,175],['Jobsite & logistics','Material pickup / delivery','flat',75,175],['Jobsite & logistics','Custom work','flat',0,0]
];
let areas=[],addons=[],brandLogoDraft=null,pendingPreviewEstimate=null;
const today=()=>new Date().toISOString().slice(0,10);
function addDays(date,days){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function id(prefix){return prefix+'-'+Math.random().toString(36).slice(2,7).toUpperCase()}
function loadBrand(){return loadWorkspaceJSON(BRAND_KEY,{})}
function saveBrandData(b){saveWorkspaceJSON(BRAND_KEY,b);renderBrandStatus();persistPartnerBrand()}
function normalizeAreaPricing(a){
  const x={...(a||{})};
  if(x.dailyRateMode!=='crew_total'){
    const legacyCrew=Math.max(1,num(x.crewSize||1));
    x.dailyRate=num(x.dailyRate)*legacyCrew;
    x.dailyRateMode='crew_total';
  }
  x.crewSize=1;
  return x;
}
function normalizeSavedDoc(d){return {...d,areas:(d?.areas||[]).map(normalizeAreaPricing)}}
function loadDocs(){return loadWorkspaceJSON(DOC_KEY,[]).map(normalizeSavedDoc)}
function saveDocs(d){saveWorkspaceJSON(DOC_KEY,d);renderSaved()}
function loadLeads(){return loadWorkspaceJSON(LEAD_KEY,[])}
function saveLeads(d){saveWorkspaceJSON(LEAD_KEY,d);renderSaved()}
function defaultArea(){return{id:id('area'),description:'Floor installation',material:'Material not included',sqft:0,pattern:'Straight',dailyRate:0,dailyRateMode:'crew_total',crewSize:1,durationDays:1,crewRate:0,sellRate:6,surcharge:0,materialCost:0,materialSell:0}}
function areaTotals(a){const sq=num(a.sqft),dailyRate=num(a.dailyRate),durationDays=num(a.durationDays),crewTotal=dailyRate*durationDays,calculatedCrewRate=sq>0&&crewTotal>0?crewTotal/sq:num(a.crewRate),surcharge=num(a.surcharge)/100,effective=num(a.sellRate)*(1+surcharge),laborSell=sq*effective,laborCost=sq*calculatedCrewRate,included=a.material!=='Material not included',matSell=included?sq*num(a.materialSell):0,matCost=included?sq*num(a.materialCost):0;return{dailyRate,durationDays,crewTotal,crewRate:calculatedCrewRate,effective,laborSell,laborCost,matSell,matCost,totalSell:laborSell+matSell,totalCost:laborCost+matCost}}
function addonTotals(a){return{sell:num(a.qty)*num(a.sellRate),cost:num(a.qty)*num(a.costRate)}}
function state(){const areaCalc=areas.map(a=>({...a,...areaTotals(a)})),addonCalc=addons.map(a=>({...a,...addonTotals(a)}));const installationSell=areaCalc.reduce((s,a)=>s+a.laborSell,0),materialSell=areaCalc.reduce((s,a)=>s+a.matSell,0),addonsSell=addonCalc.reduce((s,a)=>s+a.sell,0),durationDays=areaCalc.reduce((s,a)=>s+num(a.durationDays),0),baseSell=installationSell+materialSell+addonsSell,discount=Math.min(baseSell,num($('#discount').value)),net=baseSell-discount,taxRate=num($('#taxRate').value),tax=net*taxRate/100,total=net+tax,coreCost=areaCalc.reduce((s,a)=>s+a.totalCost,0)+addonCalc.reduce((s,a)=>s+a.cost,0),otherCosts=num($('#otherInternalCosts').value),cost=coreCost+otherCosts,contribution=net-cost,margin=net>0?contribution/net*100:0;return{client:{name:$('#clientName').value,project:$('#projectName').value,email:$('#clientEmail').value,phone:$('#clientPhone').value,address:$('#projectAddress').value},documentNo:$('#documentNo').value,issueDate:$('#issueDate').value,validThrough:$('#validThrough').value,type:$('#documentType').value,areas:areaCalc,addons:addonCalc,durationDays,discount,taxRate,tax,installationSell,materialSell,addonsSell,baseSell,net,total,coreCost,otherCosts,cost,contribution,margin,clientNotes:$('#clientNotes').value,terms:$('#terms').value,brand:loadBrand()}}
function syncAreaCard(el,a){const t=areaTotals(a);const crewTotal=el.querySelector('[data-derived="crewTotal"]'),crewRate=el.querySelector('[data-derived="crewRate"]'),effective=el.querySelector('[data-derived="effective"]'),meta=el.querySelector('[data-derived="meta"]'),total=el.querySelector('[data-derived="total"]');if(crewTotal)crewTotal.value=money(t.crewTotal);if(crewRate)crewRate.value=money(t.crewRate)+' / sqft';if(effective)effective.value=money(t.effective)+' / sqft';if(meta)meta.textContent=Math.round(num(a.sqft)).toLocaleString()+' sqft · '+a.pattern+' · '+num(a.durationDays)+' work day'+(num(a.durationDays)===1?'':'s')+(a.material==='Material not included'?' · Material not included':'');if(total)total.textContent=money(t.totalSell);calc()}
function renderAreas(){
  const box=$('#areas');box.innerHTML='';
  areas=areas.map(normalizeAreaPricing);
  areas.forEach((a,i)=>{
    if(a.dailyRate===undefined)a.dailyRate=0;
    if(a.durationDays===undefined)a.durationDays=1;
    if(a.surcharge===undefined)a.surcharge=patternSurcharges[a.pattern]??0;
    const el=document.createElement('div');
    el.className='area-card'+(window.matchMedia?.('(max-width: 760px)').matches&&i>0?' mobile-collapsed':'');
    const matOpts=materials.map(m=>`<option ${m===a.material?'selected':''}>${esc(m)}</option>`).join('');
    const patternOpts=patterns.map(p=>`<option ${p===a.pattern?'selected':''}>${esc(p)}</option>`).join('');
    const t=areaTotals(a),disabled=a.material==='Material not included'?'disabled':'';
    el.innerHTML=`<div class="area-head"><div><span class="area-index">AREA ${String(i+1).padStart(2,'0')}</span><strong>${esc(a.description||'Installation area')}</strong></div><div class="area-head-actions"><button class="area-collapse-btn" type="button" aria-label="Expand or collapse area">⌄</button>${areas.length>1?'<button class="remove-btn" type="button" aria-label="Remove area">×</button>':''}</div></div><div class="area-body"><div class="area-grid"><label class="wide"><span class="field-title">Area description</span><input data-k="description" value="${esc(a.description)}"></label><label><span class="field-title">Area (sqft)</span><input data-k="sqft" type="number" min="0" step="1" value="${a.sqft}"></label><label class="wide"><span class="field-title">Material</span><select data-k="material">${matOpts}</select></label><label><span class="field-title">Installation pattern</span><select data-k="pattern">${patternOpts}</select></label></div><div class="crew-grid"><label><span class="field-title">Daily crew cost ($)<small class="internal-tag">INTERNAL</small></span><input data-k="dailyRate" type="number" min="0" step="0.01" value="${a.dailyRate}"></label><label><span class="field-title">Duration (work days)<small class="internal-spacer">INTERNAL</small></span><input data-k="durationDays" type="number" min="0" step="1" value="${a.durationDays}"></label><label><span class="field-title">Total labor cost<small class="internal-tag">INTERNAL</small></span><input data-derived="crewTotal" value="${money(t.crewTotal)}" disabled></label><label><span class="field-title">Labor cost / sqft<small class="internal-tag">INTERNAL</small></span><input data-derived="crewRate" value="${money(t.crewRate)} / sqft" disabled></label></div><div class="crew-formula">Labor cost / sqft = total daily crew cost × work days ÷ area sqft.</div><div class="pricing-grid"><label><span class="field-title">Selling labor / sqft<small class="internal-spacer">INTERNAL</small></span><input data-k="sellRate" type="number" min="0" step="0.01" value="${a.sellRate}"></label><label><span class="field-title">Pattern surcharge %<small class="internal-spacer">INTERNAL</small></span><input data-k="surcharge" type="number" min="0" step="0.1" value="${a.surcharge}"></label><label><span class="field-title">Effective labor rate<small class="internal-spacer">INTERNAL</small></span><input data-derived="effective" value="${money(t.effective)} / sqft" disabled></label><label><span class="field-title">Material cost / sqft<small class="internal-tag">INTERNAL</small></span><input data-k="materialCost" type="number" min="0" step="0.01" value="${a.materialCost}" ${disabled}></label><label><span class="field-title">Material sell / sqft<small class="internal-spacer">INTERNAL</small></span><input data-k="materialSell" type="number" min="0" step="0.01" value="${a.materialSell}" ${disabled}></label></div></div><div class="area-total-line"><span data-derived="meta">${Math.round(num(a.sqft)).toLocaleString()} sqft · ${esc(a.pattern)} · ${num(a.durationDays)} work day${num(a.durationDays)===1?'':'s'}${a.material==='Material not included'?' · Material not included':''}</span><b data-derived="total">${money(t.totalSell)}</b></div>`;
    el.querySelectorAll('[data-k]').forEach(inp=>{
      const ev=inp.tagName==='SELECT'?'change':'input';
      inp.addEventListener(ev,()=>{
        let v=inp.value;
        if(['sqft','dailyRate','durationDays','sellRate','surcharge','materialCost','materialSell'].includes(inp.dataset.k))v=num(v);
        a[inp.dataset.k]=v;
        a.dailyRateMode='crew_total';
        if(inp.dataset.k==='pattern'){
          a.surcharge=patternSurcharges[v]??0;
          const s=el.querySelector('[data-k="surcharge"]');if(s)s.value=a.surcharge;
        }
        if(inp.dataset.k==='material'){renderAreas();return}
        if(inp.dataset.k==='description')el.querySelector('.area-head strong').textContent=v||'Installation area';
        syncAreaCard(el,a);
      });
    });
    const toggle=el.querySelector('.area-collapse-btn');
    if(toggle)toggle.onclick=()=>el.classList.toggle('mobile-collapsed');
    const rm=el.querySelector('.remove-btn');
    if(rm)rm.onclick=()=>{areas=areas.filter(x=>x.id!==a.id);renderAreas();calc()};
    box.append(el);
  });
  calc();
}
function fillCatalog(){const sel=$('#addonPreset');let currentGroup=null,groupEl=null;catalog.forEach((c,i)=>{if(c[0]!==currentGroup){currentGroup=c[0];groupEl=document.createElement('optgroup');groupEl.label=currentGroup;sel.append(groupEl)}const o=document.createElement('option');o.value=i;o.textContent=c[1];groupEl.append(o)});['Floor removal / demolition','Self-leveling compound','Waterproofing membrane','Baseboard installation','Transitions / reducers','Stairs','Backsplash installation','Furniture moving','Toilet remove & reset','Material pickup / delivery'].forEach(name=>{const idx=catalog.findIndex(c=>c[1]===name),b=document.createElement('button');b.type='button';b.textContent='+ '+name.replace(' / demolition','').replace(' installation','');b.onclick=()=>addCatalog(idx);$('#quickAdd').append(b)})}
function addCatalog(idx){const c=catalog[idx];if(!c)return;addons.push({id:id('add'),name:c[1],unit:c[2],qty:1,costRate:c[3],sellRate:c[4]});renderAddons()}
function renderAddons(){const box=$('#addons');box.innerHTML='';addons.forEach(a=>{const row=document.createElement('div');row.className='addon-row';row.innerHTML=`<label>Service<input data-k="name" value="${esc(a.name)}"></label><label>Qty<input data-k="qty" type="number" min="0" step="0.01" value="${a.qty}"></label><label>Unit<select data-k="unit">${['sqft','lf','each','room','flat'].map(u=>`<option ${u===a.unit?'selected':''}>${u}</option>`).join('')}</select></label><label>Cost rate <span class="internal-tag">INTERNAL</span><input data-k="costRate" type="number" min="0" step="0.01" value="${a.costRate}"></label><label>Sell rate<input data-k="sellRate" type="number" min="0" step="0.01" value="${a.sellRate}"></label><button class="remove-btn" type="button" aria-label="Remove">×</button>`;row.querySelectorAll('[data-k]').forEach(inp=>{const ev=inp.tagName==='SELECT'?'change':'input';inp.addEventListener(ev,()=>{a[inp.dataset.k]=['qty','costRate','sellRate'].includes(inp.dataset.k)?num(inp.value):inp.value;calc()})});row.querySelector('.remove-btn').onclick=()=>{addons=addons.filter(x=>x.id!==a.id);renderAddons()};box.append(row)});calc()}
function calc(){const s=state();$('#summaryType').textContent=s.type==='INVOICE'?'Invoice':'Estimate';$('#grandTotal').textContent=money(s.total);$('#mobileTotal').textContent=money(s.total);$('#installationSell').textContent=money(s.installationSell);$('#materialSell').textContent=s.materialSell>0?money(s.materialSell):'Not included';$('#addonsSell').textContent=money(s.addonsSell);const durationView=$('#durationView');if(durationView)durationView.textContent=s.durationDays+' work day'+(s.durationDays===1?'':'s');$('#discountView').textContent='− '+money(s.discount);$('#taxView').textContent=money(s.tax);$('#internalCosts').textContent=money(s.coreCost);$('#otherCostsView').textContent=money(s.otherCosts);$('#contribution').textContent=money(s.contribution);$('#marginPct').textContent=s.margin.toFixed(1)+'%';$('#contribution').style.color=s.contribution<0?'#a33b3b':'#187552';$('#downloadBtn').textContent=`Download ${s.type==='INVOICE'?'invoice':'estimate'} PDF`;const emailMain=$('#sendDocEmailBtn');if(emailMain)emailMain.textContent=`PRO · Email ${s.type==='INVOICE'?'invoice':'estimate'}`;$('#convertBtn').style.display=s.type==='INVOICE'?'none':'flex'}
function resetDoc(){areas=[defaultArea()];addons=[];$('#clientName').value='';$('#projectName').value='';$('#clientEmail').value='';$('#clientPhone').value='';$('#projectAddress').value='';$('#documentType').value='ESTIMATE';$('#documentNo').value='EST-'+Math.random().toString(36).slice(2,9).toUpperCase();$('#issueDate').value=today();$('#validThrough').value=addDays(today(),30);$('#discount').value=0;$('#taxRate').value=0;$('#otherInternalCosts').value=0;$('#clientNotes').value='';renderAreas();renderAddons();calc()}
function snapshot(){return JSON.parse(JSON.stringify(state()))}
function customerIdentity(d){
  const c=d?.client||{};
  const email=String(c.email||'').trim().toLowerCase();
  if(email)return 'email:'+email;
  const phone=String(c.phone||'').replace(/\D/g,'');
  if(phone)return 'phone:'+phone;
  const name=String(c.name||'').trim().toLowerCase().replace(/\s+/g,' ');
  const address=String(c.address||'').trim().toLowerCase().replace(/\s+/g,' ');
  if(name||address)return 'nameaddr:'+name+'|'+address;
  return '';
}
function saveCurrent(){const s=snapshot();if(!(s.client.name||s.client.email||s.client.phone)){alert('Add at least a client name, email or phone before saving.');return null}const docs=loadDocs();const found=docs.findIndex(d=>d.documentNo===s.documentNo&&d.type===s.type);const existing=found>=0?docs[found]:null;const record={...s,localId:existing?.localId||id('doc'),savedAt:new Date().toISOString()};if(found>=0)docs[found]=record;else docs.unshift(record);saveDocs(docs);if(currentSession?.user&&currentPartner)upsertCloudDocument(record);return record}
function loadSavedDocument(d,scroll=true){
  if(!d)return;
  const c=d.client||{};
  $('#clientName').value=c.name||'';
  $('#projectName').value=c.project||'';
  $('#clientEmail').value=c.email||'';
  $('#clientPhone').value=c.phone||'';
  $('#projectAddress').value=c.address||'';
  $('#documentType').value=d.type==='INVOICE'?'INVOICE':'ESTIMATE';
  $('#documentNo').value=d.documentNo||'';
  $('#issueDate').value=d.issueDate||today();
  $('#validThrough').value=d.validThrough||addDays(today(),30);
  $('#discount').value=num(d.discount);
  $('#taxRate').value=num(d.taxRate);
  $('#otherInternalCosts').value=num(d.otherCosts);
  $('#clientNotes').value=d.clientNotes||'';
  $('#terms').value=d.terms||'';
  areas=(d.areas||[]).map(a=>({...a,id:a.id||id('area')}));
  addons=(d.addons||[]).map(a=>({...a,id:a.id||id('add')}));
  if(!areas.length)areas=[defaultArea()];
  renderAreas();
  renderAddons();
  calc();
  if(scroll)document.querySelector('#top')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function convertSavedToInvoice(d){
  if(!d||d.type!=='ESTIMATE')return;
  previewDocument(d,false,true);
}
function convertPendingEstimateToInvoice(){
  const d=pendingPreviewEstimate;
  if(!d||d.type!=='ESTIMATE')return false;
  const invoice={
    ...JSON.parse(JSON.stringify(d)),
    localId:id('doc'),
    type:'INVOICE',
    documentNo:'INV-'+Math.random().toString(36).slice(2,9).toUpperCase(),
    issueDate:today(),
    validThrough:'',
    sourceEstimateNo:d.documentNo,
    savedAt:new Date().toISOString()
  };
  const docs=loadDocs();
  docs.unshift(invoice);
  saveDocs(docs);
  if(currentSession?.user&&currentPartner)upsertCloudDocument(invoice);
  loadSavedDocument(invoice,false);
  pendingPreviewEstimate=null;
  document.querySelector('#top')?.scrollIntoView({behavior:'smooth',block:'start'});
  alert('Invoice created from '+d.documentNo+'. It is saved and ready to edit, email or download.');
  return true;
}
window.convertPendingEstimateToInvoice=convertPendingEstimateToInvoice;
function emailSavedDocument(d,purpose=null,autoGenerate=false){
  requirePro('email',()=>{loadSavedDocument(d,false);openEmailDialog(purpose,autoGenerate)});
}
function renderSaved(){
  const docs=loadDocs(),box=$('#savedDocs');
  const customerIds=new Set(docs.map(customerIdentity).filter(Boolean));
  const estimates=docs.filter(d=>d.type==='ESTIMATE');
  const invoices=docs.filter(d=>d.type==='INVOICE');
  const estimateTotal=estimates.reduce((s,d)=>s+num(d.total),0);
  const invoiceTotal=invoices.reduce((s,d)=>s+num(d.total),0);
  const leads=loadLeads();

  $('#statCustomers').textContent=customerIds.size;
  $('#statEstimates').textContent=estimates.length;
  $('#statEstimateValue').textContent=money(estimateTotal);
  $('#statInvoices').textContent=invoices.length;
  $('#statInvoiceValue').textContent=money(invoiceTotal);
  const leadStat=$('#statMaterialLeads');if(leadStat)leadStat.textContent=leads.length;

  if(!docs.length){box.innerHTML='<p class="empty">No saved documents yet.</p>';return}
  box.innerHTML='';
  docs.forEach(d=>{
    const row=document.createElement('div');
    row.className='saved-item saved-item-managed';
    row.innerHTML=`<div><div class="doc-type">${esc(d.type)}</div><strong>${esc(d.documentNo||'-')}</strong>${d.sourceEstimateNo?`<small>From ${esc(d.sourceEstimateNo)}</small>`:''}</div><div><strong>${esc(d.client?.name||'Unnamed client')}</strong><small>${esc(d.client?.project||'')}</small></div><span>${d.issueDate||''}</span><strong>${money(d.total)}</strong><div class="saved-actions"><button class="btn btn-secondary saved-edit" type="button">Edit</button><button class="btn btn-secondary saved-pdf" type="button">PDF</button><button class="btn btn-pro-email saved-email" type="button"><span>PRO</span>Email</button><button class="btn btn-secondary ai-action-btn saved-ai" type="button">✦ ${d.type==='ESTIMATE'?'AI follow-up':'AI reminder'}</button>${d.type==='ESTIMATE'?'<button class="btn btn-gold saved-convert" type="button">Create invoice</button>':''}</div>`;
    row.querySelector('.saved-edit').onclick=()=>loadSavedDocument(d,true);
    row.querySelector('.saved-pdf').onclick=()=>previewDocument(d,true);
    row.querySelector('.saved-email').onclick=()=>emailSavedDocument(d);
    const aiBtn=row.querySelector('.saved-ai');if(aiBtn)aiBtn.onclick=()=>emailSavedDocument(d,d.type==='ESTIMATE'?'estimate_followup':'invoice_reminder',true);
    const convert=row.querySelector('.saved-convert');if(convert)convert.onclick=()=>convertSavedToInvoice(d);
    box.append(row);
  });
}
function brandHeader(b,type,no,date,valid){const logo=b.logoData?`<img class="doc-logo" src="${b.logoData}" alt="Company logo">`:'';const issuer=b.name?`<div class="issuer"><strong>${esc(b.name)}</strong>${b.address?`<span>${esc(b.address)}</span>`:''}<span>${[b.phone,b.email,b.license].filter(Boolean).map(esc).join(' · ')}</span></div>`:`<div class="issuer neutral"><strong>PROJECT ${type}</strong><span>Issued by the contractor / service provider</span></div>`;return `<header class="doc-head"><div class="issuer-wrap">${logo}${issuer}</div><div class="doc-meta"><strong>${type}</strong><span>${esc(no)}</span><span>Issue: ${esc(date||'')}</span>${type==='ESTIMATE'&&valid?`<span>Valid through: ${esc(valid)}</span>`:''}</div></header>`}
function docHtml(s,autoPrint=false,allowConvert=false){const b=s.brand||{},areaRows=s.areas.map(a=>`<tr><td><strong>${esc(a.description)}</strong><br><span>${esc(a.material)} · ${esc(a.pattern)} · ${num(a.durationDays)} work day${num(a.durationDays)===1?'':'s'}</span></td><td>${Math.round(a.sqft).toLocaleString()} sqft</td><td>${money(a.laborSell+a.matSell)}</td></tr>`).join(''),addonRows=s.addons.filter(a=>a.sell>0).map(a=>`<tr><td>${esc(a.name)}</td><td>${a.qty} ${esc(a.unit)}</td><td>${money(a.sell)}</td></tr>`).join(''),matNote=s.materialSell<=0?'<p class="notice"><strong>Material not included.</strong> Materials are excluded unless specifically listed in the scope.</p>':'';return `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><title>${s.type} ${esc(s.documentNo)}</title><style>.preview-toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:flex-end;gap:8px;padding:10px 0 16px;background:#fff}.preview-toolbar button{border:1px solid #cfd4da;background:#fff;color:#1b2026;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}.preview-toolbar .primary{background:#b7893f;color:#fff;border-color:#b7893f}body{font-family:Arial,sans-serif;color:#17191d;margin:36px;line-height:1.4}.doc-head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #17191d;padding-bottom:16px}.issuer-wrap{display:flex;align-items:center;gap:14px}.doc-logo{max-width:115px;max-height:72px;object-fit:contain}.issuer{display:flex;flex-direction:column;gap:3px}.issuer strong{font-size:20px}.issuer span,.doc-meta span{font-size:11px;color:#666}.doc-meta{text-align:right;display:flex;flex-direction:column;gap:3px}.doc-meta strong{font-size:18px}.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0;padding:14px;background:#f5f6f7}.client-grid strong{display:block;font-size:11px;text-transform:uppercase;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:14px}th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:2px solid #222;padding:8px}td{padding:10px 8px;border-bottom:1px solid #ddd;font-size:12px}td:nth-child(3),th:nth-child(3){text-align:right}.totals{width:330px;margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px 0}.totals .grand{font-size:18px;font-weight:900;border-top:2px solid #222;margin-top:6px;padding-top:9px}.notes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:25px}.notes h3{font-size:11px;text-transform:uppercase}.notes p{font-size:11px;white-space:pre-wrap}.notice{font-size:11px;background:#f7f4ee;padding:10px;border-left:3px solid #a87a38}.footer{margin-top:32px;border-top:1px solid #ddd;padding-top:10px;font-size:9px;color:#777}.neutral strong{font-size:17px}@media print{body{margin:20px}.preview-toolbar{display:none!important}}</style></head><body>${allowConvert&&s.type==='ESTIMATE'?'<div class="preview-toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button><button class="primary" type="button" onclick="if(window.opener&&window.opener.convertPendingEstimateToInvoice&&window.opener.convertPendingEstimateToInvoice()){window.close()}">Create Invoice</button></div>':''}${brandHeader(b,s.type,s.documentNo,s.issueDate,s.validThrough)}<section class="client-grid"><div><strong>Client</strong>${esc(s.client.name||'-')}<br>${esc(s.client.email||'')}<br>${esc(s.client.phone||'')}</div><div><strong>Project</strong>${esc(s.client.project||'-')}<br>${esc(s.client.address||'')}<br>Estimated duration: ${s.durationDays} work day${s.durationDays===1?'':'s'}</div></section>${matNote}<table><thead><tr><th>Scope</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${areaRows}${addonRows}</tbody></table><div class="totals"><div><span>Subtotal</span><strong>${money(s.baseSell)}</strong></div><div><span>Discount</span><strong>− ${money(s.discount)}</strong></div>${s.taxRate>0?`<div><span>Tax (${s.taxRate}%)</span><strong>${money(s.tax)}</strong></div>`:''}<div class="grand"><span>Total</span><strong>${money(s.total)}</strong></div></div><section class="notes"><div><h3>Notes</h3><p>${esc(s.clientNotes||'')}</p></div><div><h3>Terms & payment</h3><p>${esc(s.terms||'')}</p></div></section><div class="footer">This document is issued by the company/service provider identified above. Verify measurements, site conditions, material specifications, taxes and applicable licensing requirements before acceptance.</div>${autoPrint?'<script>window.onload=()=>window.print()<\/script>':''}</body></html>`}
function previewDocument(s,autoPrint=false,allowConvert=false){
  if(!s)return;
  if(allowConvert)pendingPreviewEstimate=JSON.parse(JSON.stringify(s));
  const key='pv_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
  try{
    localStorage.setItem('pristine_document_preview:'+key,JSON.stringify({
      createdAt:new Date().toISOString(),
      expiresAt:Date.now()+24*60*60*1000,
      document:s
    }));
  }catch(err){
    alert('Could not prepare the document preview.');
    return;
  }
  const params=new URLSearchParams({key});
  if(autoPrint)params.set('print','1');
  if(allowConvert&&s.type==='ESTIMATE')params.set('convert','1');
  const w=window.open('document-preview.html?'+params.toString(),'_blank');
  if(!w)alert('Please allow pop-ups for document preview.');
}
function currentForDocument(){const s=snapshot();if(!(s.client.name||s.client.email||s.client.phone)){alert('Add at least a client name, email or phone before generating a document.');return null}return s}
function convertToInvoice(){const s=currentForDocument();if(!s)return;if(s.type!=='ESTIMATE')return;previewDocument(s,false,true)}
function estimateAreaSqft(){return areas.reduce((s,a)=>s+num(a.sqft),0)}
function quoteAreaSqft(){
  const manual=num($('#quoteMeasuredSqftInput')?.value);
  return manual>0?manual:estimateAreaSqft();
}
function quoteRequiredSqft(){return Math.round(quoteAreaSqft()*(1+num($('#quoteWaste')?.value||10)/100))}
function refreshQuoteMetrics(){
  const r=$('#quoteRequiredSqft');
  if(r)r.textContent=quoteRequiredSqft().toLocaleString()+' sqft';
}
function useEstimateSqft(){
  const input=$('#quoteMeasuredSqftInput');
  if(input)input.value=String(Math.round(estimateAreaSqft()));
  refreshQuoteMetrics();
}
function selectedMaterialOpportunityType(){
  return document.querySelector('input[name="materialOpportunityType"]:checked')?.value||'quote_for_me';
}
function syncMaterialOpportunityUI(fillContact=false){
  const type=selectedMaterialOpportunityType(),s=state(),b=loadBrand();
  const purchased=type==='already_purchased';
  const consentRow=$('#quoteConsentRow'),btn=$('#sendMaterialQuoteBtn');
  if(consentRow)consentRow.classList.toggle('hidden',purchased);
  if(btn)btn.textContent=purchased?'Record project':'Send material opportunity';
  if(purchased)$('#quoteConsent').checked=false;
  if(fillContact){
    if(type==='send_to_customer'){
      $('#quoteCompany').value=s.client.name||'';
      $('#quotePhone').value=s.client.phone||'';
      $('#quoteEmail').value=s.client.email||'';
      $('#quoteBuyerRole').value='homeowner';
    }else{
      $('#quoteCompany').value=b.name||currentPartner?.company_name||s.client.name||'';
      $('#quotePhone').value=b.phone||currentPartner?.phone||'';
      $('#quoteEmail').value=b.email||currentPartner?.email||currentSession?.user?.email||'';
      const usual=currentPartnerProfile?.usual_material_buyer||'my_company';
      $('#quoteBuyerRole').value=usual==='varies'?'unknown':usual;
    }
  }
}
function openMaterialQuote(){
  const s=state(),sel=$('#quoteMaterial');
  if(sel){sel.innerHTML=materials.filter(m=>m!=='Material not included').map(m=>'<option>'+esc(m)+'</option>').join('');const preferred=s.areas.find(a=>a.material&&a.material!=='Material not included')?.material;if(preferred)sel.value=preferred}
  const first=document.querySelector('input[name="materialOpportunityType"][value="quote_for_me"]');if(first)first.checked=true;
  $('#quoteProject').value=s.client.project||'';
  $('#quoteAddress').value=s.client.address||'';
  $('#quoteWaste').value=10;
  const sqftInput=$('#quoteMeasuredSqftInput');if(sqftInput)sqftInput.value=String(Math.round(estimateAreaSqft()));
  $('#quoteNotes').value='';
  $('#quoteConsent').checked=false;
  syncMaterialOpportunityUI(true);
  refreshQuoteMetrics();
  $('#materialQuoteDialog').showModal();
}
function materialLeadPayload(){
  const s=state(),brand=loadBrand();
  return {
    id:id('lead'),
    createdAt:new Date().toISOString(),
    opportunityType:selectedMaterialOpportunityType(),
    buyerRole:$('#quoteBuyerRole').value||'unknown',
    company:$('#quoteCompany').value.trim(),
    phone:$('#quotePhone').value.trim(),
    email:$('#quoteEmail').value.trim(),
    project:$('#quoteProject').value.trim(),
    address:$('#quoteAddress').value.trim(),
    material:$('#quoteMaterial').value,
    measuredSqft:Math.round(quoteAreaSqft()),
    waste:num($('#quoteWaste').value),
    requiredSqft:quoteRequiredSqft(),
    notes:$('#quoteNotes').value.trim(),
    estimateNo:s.documentNo,
    estimateTotal:s.total,
    partnerBrand:brand.name||'',
    source:'Pristine Partner Network'
  };
}
async function sendMaterialQuote(){
  const payload=materialLeadPayload();
  if(!payload.measuredSqft){alert('Add project square footage before creating a material opportunity.');return}
  const purchased=payload.opportunityType==='already_purchased';
  if(!purchased && !(payload.phone||payload.email)){alert('Add an email or phone number for the material opportunity.');return}
  if(!purchased && !$('#quoteConsent').checked){alert('Please authorize sharing the project details for material pricing.');return}
  const sendBtn=$('#sendMaterialQuoteBtn');if(sendBtn){sendBtn.disabled=true;sendBtn.textContent=purchased?'Recording...':'Sending...'}
  try{
    const cloudPayload={
      company:payload.company,name:payload.company,phone:payload.phone,email:payload.email,
      project:payload.project,address:payload.address,material:payload.material,
      opportunity_type:payload.opportunityType,buyer_role:payload.buyerRole,
      measured_sqft:payload.measuredSqft,waste_pct:payload.waste,required_sqft:payload.requiredSqft,
      estimate_no:payload.estimateNo,estimate_total:payload.estimateTotal,
      notes:payload.notes,consent:purchased?false:true,website:''
    };
    const r=await fetch(PRISTINE_API+'?action=material-lead',{method:'POST',headers:apiHeaders(),body:JSON.stringify(cloudPayload)});
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Could not save material opportunity');
    if(d.lead){
      payload.cloudId=d.lead.id||null;
      const leads=loadLeads();leads.unshift(payload);saveLeads(leads);
    }
    await fetchPartnerNetworkData(false);
    $('#materialQuoteDialog').close();
    alert(purchased?'Project recorded. No material sales lead was created.':'Material opportunity sent and attributed to your Partner ID.');
  }catch(err){
    alert('Could not save the material opportunity. Please try again. '+(err?.message||''));
  }finally{
    if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='Send material opportunity'}
  }
}
let currentProFeature='pro';
let currentAiPurpose=null;
let pendingCloudDocument=null;

async function openEmailDialog(purpose=null,autoGenerate=false){
  if(!(proVerified||await verifyPro())){openPro('email');return}
  const s=currentForDocument(); if(!s)return;
  currentAiPurpose=purpose||null;
  if(!s.client.email){alert('Add the customer email before sending.');return}
  $('#sendEmailTo').value=s.client.email||'';
  $('#sendEmailName').value=s.client.name||'';
  $('#sendEmailSubject').value=(loadBrand().name||'Your contractor')+' sent you a '+(s.type==='INVOICE'?'invoice':'estimate')+' '+s.documentNo;
  $('#sendEmailMessage').value='Hi '+(s.client.name||'there')+',\n\nYour '+(s.type==='INVOICE'?'invoice':'estimate')+' is ready to review. Please use the secure link in this email to view the document.'+(s.type==='ESTIMATE'?' You can accept the estimate online.':'')+'\n\nThank you.';
  const aiStatus=$('#aiEmailStatus');if(aiStatus)aiStatus.textContent='AI drafts are editable before sending.';
  pendingCloudDocument=null;
  $('#emailDialog').showModal();
  if(autoGenerate)setTimeout(()=>generateAiEmailDraft(),100);
}



async function openAutomationSettings(){
  if(!(proVerified||await verifyPro())){openPro('ai');return}
  if(!currentPartner)return;
  const {data,error}=await sb.from('ai_automation_rules').select('*').eq('partner_id',currentPartner.id);
  if(error){alert(error.message);return}
  const byKey=new Map((data||[]).map(x=>[x.rule_key,x]));
  const set=(key,check,delay)=>{const r=byKey.get(key);if(check)$(check).checked=Boolean(r?.enabled);if(delay&&r?.delay_hours!=null)$(delay).value=String(r.delay_hours)};
  set('estimate_followup','#autoEstimateFollowup','#autoEstimateDelay');
  set('invoice_reminder','#autoInvoiceReminder','#autoInvoiceDelay');
  set('acceptance_confirmation','#autoAcceptance');
  const sample=(data||[])[0];$('#automationApproval').value=sample?.approval_mode||'review';$('#automationTone').value=sample?.tone||'professional';
  $('#automationMessage').textContent='';
  await loadAutomationReviewQueue();
  $('#automationDialog').showModal();
}

async function loadAutomationReviewQueue(){
  if(!currentPartner)return;
  const {data,error}=await sb.from('automation_queue')
    .select('id,rule_key,recipient,subject,message,created_at,due_at')
    .eq('partner_id',currentPartner.id)
    .eq('status','review')
    .order('due_at',{ascending:true});
  const box=$('#automationReviewList'),count=$('#automationReviewCount');
  if(error){if(box)box.innerHTML='<p class="empty">'+esc(error.message)+'</p>';return}
  if(count)count.textContent=(data||[]).length+' pending';
  if(!box)return;
  if(!(data||[]).length){box.innerHTML='<p class="empty">No AI drafts waiting for review.</p>';return}
  box.innerHTML='';
  (data||[]).forEach(task=>{
    const el=document.createElement('div');
    el.className='automation-review-item';
    const label=task.rule_key==='estimate_followup'?'Estimate follow-up':task.rule_key==='invoice_reminder'?'Invoice reminder':'Acceptance confirmation';
    el.innerHTML='<div class="automation-review-title"><strong>'+esc(label)+'</strong><span>'+esc(task.recipient||'')+'</span></div>'+
      '<label>Subject<input class="review-subject" value="'+esc(task.subject||'')+'"></label>'+
      '<label>Message<textarea class="review-message" rows="5">'+esc(task.message||'')+'</textarea></label>'+
      '<div class="automation-review-actions"><button class="btn btn-gold review-send" type="button">Send</button></div>';
    el.querySelector('.review-send').onclick=()=>sendAutomationReviewTask(task.id,el);
    box.append(el);
  });
}
async function sendAutomationReviewTask(taskId,el){
  const btn=el.querySelector('.review-send');
  if(btn){btn.disabled=true;btn.textContent='Sending...'}
  try{
    const r=await fetch(PRISTINE_API+'?action=send-automation-task',{
      method:'POST',
      headers:apiHeaders(),
      body:JSON.stringify({
        task_id:taskId,
        subject:el.querySelector('.review-subject').value.trim(),
        message:el.querySelector('.review-message').value.trim()
      })
    });
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Could not send automation');
    await loadAutomationReviewQueue();
  }catch(err){
    $('#automationMessage').textContent=err?.message||'Could not send automation.';
    if(btn){btn.disabled=false;btn.textContent='Send'}
  }
}

async function saveAutomationSettings(){
  if(!currentPartner)return;
  const approval=$('#automationApproval').value,tone=$('#automationTone').value;
  const rules=[
    {rule_key:'estimate_followup',enabled:$('#autoEstimateFollowup').checked,trigger_event:'estimate_unaccepted',delay_hours:Number($('#autoEstimateDelay').value||48)},
    {rule_key:'invoice_reminder',enabled:$('#autoInvoiceReminder').checked,trigger_event:'invoice_open',delay_hours:Number($('#autoInvoiceDelay').value||72)},
    {rule_key:'acceptance_confirmation',enabled:$('#autoAcceptance').checked,trigger_event:'estimate_accepted',delay_hours:0}
  ].map(r=>({...r,partner_id:currentPartner.id,channel:'email',approval_mode:approval,tone,updated_at:new Date().toISOString()}));
  $('#automationMessage').textContent='Saving...';
  const {error}=await sb.from('ai_automation_rules').upsert(rules,{onConflict:'partner_id,rule_key'});
  if(error){$('#automationMessage').textContent=error.message;return}
  $('#automationMessage').textContent='Automation preferences saved.';
  setTimeout(()=>$('#automationDialog')?.close(),500);
}

async function generateAiEmailDraft(){
  if(!(proVerified||await verifyPro())){openPro('ai');return}
  const s=currentForDocument();if(!s)return;
  const btn=$('#generateAiEmailBtn'),status=$('#aiEmailStatus');
  if(btn){btn.disabled=true;btn.textContent='Generating...'}if(status)status.textContent='Creating a professional draft from this document...';
  try{
    const purpose=currentAiPurpose||(s.type==='INVOICE'?'invoice_send':'estimate_send');
    const r=await fetch(PRISTINE_API+'?action=ai-compose',{
      method:'POST',headers:apiHeaders(),
      body:JSON.stringify({purpose,document:s,brand:loadBrand()})
    });
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'AI draft failed');
    $('#sendEmailSubject').value=d.subject||$('#sendEmailSubject').value;
    $('#sendEmailMessage').value=d.body||$('#sendEmailMessage').value;
    if(status)status.textContent='AI draft ready. Review and edit before sending.';
  }catch(err){
    if(status)status.textContent=err?.message||'AI draft is unavailable.';
  }finally{if(btn){btn.disabled=false;btn.textContent='✦ Generate with AI'}}
}

async function sendEmailNow(){
  const to=$('#sendEmailTo').value.trim();
  if(!to){alert('Customer email is required.');return}
  const btn=$('#sendEmailNowBtn'); if(btn){btn.disabled=true;btn.textContent='Sending...'}
  try{
    const d=await createCloudDocument();
    if(!d?.document?.id||!d?.manage_token)throw new Error('Could not prepare cloud document');
    pendingCloudDocument=d;
    const r=await fetch(PRISTINE_API+'?action=send-document-email',{
      method:'POST',
      headers:apiHeaders(),
      body:JSON.stringify({
        document_id:d.document.id,
        manage_token:d.manage_token,
        to,
        subject:$('#sendEmailSubject').value.trim(),
        message:$('#sendEmailMessage').value.trim(),
        pro_token:getProToken()
      })
    });
    const out=await r.json();
    if(!r.ok||!out.ok)throw new Error(out.error||'Email could not be sent');
    $('#emailDialog').close();
    alert('Email sent successfully to '+to+'.');
  }catch(err){
    alert(err?.message||'Email could not be sent.');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Send email'}
  }
}

function openPro(feature){
  currentProFeature=feature;
  const copy={
    email:['Email estimate / invoice','Send branded estimate and invoice emails directly from the platform, with PDF attachment and delivery history.'],
    text:['Text customer','Send estimate links, invoice reminders and status updates by SMS.'],
    followup:['Automated follow-up','Create scheduled reminders for estimates that have not been accepted yet.'],
    client:['Client view','Create a secure web link for the customer to view and accept the estimate online.'],
    ai:['AI Communication Assistant','Generate professional estimate, invoice, follow-up and collections messages using the document context.']
  };
  const [title,body]=copy[feature]||['Pro feature','This feature is available in Pristine Estimator Pro.'];
  $('#proFeatureTitle').textContent=title;$('#proFeatureCopy').textContent=body;
  const btn=$('#proInterestBtn'); if(btn)btn.textContent='Upgrade to Pro · $12.99/mo';
  $('#proDialog').showModal();
}
async function createCloudDocument(){
  const current=currentForDocument(); if(!current)return null;
  const s=saveCurrent(); if(!s)return null;
  const payload={client_document_id:s.localId,document_no:s.documentNo,document_type:s.type,project_name:s.client.project,project_address:s.client.address,total:s.total,payload:s,pro_token:getProToken()};
  const r=await fetch(PRISTINE_API+'?action=document',{method:'POST',headers:apiHeaders(),body:JSON.stringify(payload)});
  const d=await r.json(); if(!r.ok||!d.ok)throw new Error(d.error||'Could not create client link');
  return d;
}
async function joinProInterest(){
  const s=state(),b=loadBrand(),company=b.name||'',email=b.email||s.client.email||'',phone=b.phone||s.client.phone||'';
  try{await fetch(PRISTINE_API+'?action=pro-interest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company,email,phone,feature:currentProFeature,website:''})})}catch{}
  $('#proDialog').close();
  const checkout=window.PRISTINE_BILLING?.plans?.pro?.checkoutUrl;
  if(checkout){window.open(checkout,'_blank','noopener')}else alert('Pro checkout is not available yet.');
}
function renderBrandStatus(){const b=loadBrand();$('#brandStatus').textContent=b.name||'No company brand set';const prev=$('#brandLogoPreview');if(prev){prev.innerHTML=b.logoData?`<img src="${b.logoData}" alt="Brand logo">`:'LOGO'}}
function openBrand(){const b=loadBrand();brandLogoDraft=b.logoData||null;$('#brandName').value=b.name||'';$('#brandPhone').value=b.phone||'';$('#brandEmail').value=b.email||'';$('#brandLicense').value=b.license||'';$('#brandAddress').value=b.address||'';renderBrandStatus();$('#brandDialog').showModal()}
function saveBrandFromDialog(){saveBrandData({name:$('#brandName').value.trim(),phone:$('#brandPhone').value.trim(),email:$('#brandEmail').value.trim(),license:$('#brandLicense').value.trim(),address:$('#brandAddress').value.trim(),logoData:brandLogoDraft});renderBrandStatus()}
async function activateProFromCheckout(){
  const q=new URLSearchParams(location.search);
  if(q.get('billing')!=='success')return;
  const sessionId=q.get('session_id');
  if(!sessionId){alert('Payment completed, but the checkout session was not returned. Please contact support.');return}
  try{
    const r=await fetch(PRISTINE_API+'?action=activate-pro',{method:'POST',headers:apiHeaders(),body:JSON.stringify({session_id:sessionId})});
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Could not activate Pro');
    setProToken(d.pro_token);
    proVerified=true;
    history.replaceState({},'',location.pathname);
    alert('Pristine Estimator Pro is active on this device.');
  }catch(err){
    alert((err?.message||'Could not activate Pro')+'. If payment was just completed, wait a few seconds and refresh this page.');
  }
}
async function init(){fillCatalog();resetDoc();renderSaved();renderBrandStatus();['discount','taxRate','otherInternalCosts','documentType'].forEach(id=>$('#'+id).addEventListener('input',calc));$('#addAreaBtn').onclick=()=>{areas.push(defaultArea());renderAreas()};$('#addPresetBtn').onclick=()=>{if($('#addonPreset').value!=='')addCatalog(Number($('#addonPreset').value))};$('#addCustomAddonBtn').onclick=()=>{addons.push({id:id('add'),name:'Custom work',unit:'flat',qty:1,costRate:0,sellRate:0});renderAddons()};$('#newDocBtn').onclick=()=>{if(confirm('Start a new estimate? Unsaved changes will be cleared.'))resetDoc()};$('#saveBtn').onclick=()=>{if(saveCurrent())alert('Document saved to your company workspace.')};$('#previewBtn').onclick=()=>{const s=currentForDocument();if(s)previewDocument(s,false)};$('#downloadBtn').onclick=()=>{const s=currentForDocument();if(s)previewDocument(s,true)};$('#convertBtn').onclick=convertToInvoice;$('#clearDocsBtn').onclick=async()=>{const btn=$('#clearDocsBtn');if(btn){btn.disabled=true;btn.textContent='Refreshing...'}await syncCloudDocuments(true);if(btn){btn.disabled=false;btn.textContent='Refresh workspace'}};$('#brandBtn').onclick=openBrand;$('#brandCardBtn').onclick=openBrand;const navBrand=$('#navBrandBtn');if(navBrand)navBrand.onclick=openBrand;$('#saveBrandBtn').addEventListener('click',saveBrandFromDialog);
  const accountBtn=$('#accountBtn');if(accountBtn)accountBtn.onclick=openAccountDialog;
  const accountStatusBtn=$('#accountStatusBtn');if(accountStatusBtn)accountStatusBtn.onclick=openAccountDialog;
  const closeAccount=$('#closeAccountDialog');if(closeAccount)closeAccount.onclick=()=>$('#accountDialog').close();
  const signIn=$('#signInBtn');if(signIn)signIn.onclick=signInAccount;
  const signUp=$('#signUpBtn');if(signUp)signUp.onclick=signUpAccount;
  const signOut=$('#signOutBtn');if(signOut)signOut.onclick=signOutAccount;
  const forgot=$('#forgotAccountPassword');if(forgot)forgot.onclick=requestAccountPasswordReset;
  const saveNew=$('#saveNewPasswordBtn');if(saveNew)saveNew.onclick=saveNewAccountPassword;
  const editPartner=$('#editPartnerProfileBtn');if(editPartner)editPartner.onclick=openPartnerProfile;
  const copyReferral=$('#copyReferralLinkBtn');if(copyReferral)copyReferral.onclick=copyPartnerReferralLink;
  const savePartner=$('#savePartnerProfileBtn');if(savePartner)savePartner.onclick=savePartnerProfile;
  ['closePartnerProfile','partnerProfileLaterBtn'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#partnerProfileDialog')?.close()});$('#brandLogoInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>800000){alert('Please use a logo smaller than 800 KB.');return}const reader=new FileReader();reader.onload=()=>{brandLogoDraft=reader.result;$('#brandLogoPreview').innerHTML=`<img src="${reader.result}" alt="Brand logo">`};reader.readAsDataURL(f)});$('#removeBrandLogo').onclick=()=>{brandLogoDraft=null;$('#brandLogoPreview').textContent='LOGO'};$('#mobileSummaryBtn').onclick=()=>$('.summary-card').scrollIntoView({behavior:'smooth',block:'start'});const mobileSave=$('#mobileSaveBtn');if(mobileSave)mobileSave.onclick=()=>{if(saveCurrent())alert('Document saved to your company workspace.')};const mq=$('#materialQuoteBtn');if(mq)mq.onclick=openMaterialQuote;const partnerMaterial=$('#partnerMaterialBtn');if(partnerMaterial)partnerMaterial.onclick=openMaterialQuote;const qm=$('#quoteWaste');if(qm)qm.addEventListener('input',refreshQuoteMetrics);const qsqft=$('#quoteMeasuredSqftInput');if(qsqft)qsqft.addEventListener('input',refreshQuoteMetrics);const useEstimate=$('#useEstimateSqftBtn');if(useEstimate)useEstimate.onclick=useEstimateSqft;document.querySelectorAll('input[name="materialOpportunityType"]').forEach(el=>el.addEventListener('change',()=>syncMaterialOpportunityUI(true)));const sendQ=$('#sendMaterialQuoteBtn');if(sendQ)sendQ.onclick=sendMaterialQuote;['closeMaterialQuote','cancelMaterialQuote'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#materialQuoteDialog').close()});const emailBtn=$('#emailClientBtn');if(emailBtn)emailBtn.onclick=()=>requirePro('email',openEmailDialog);const mainEmailBtn=$('#sendDocEmailBtn');if(mainEmailBtn)mainEmailBtn.onclick=()=>requirePro('email',()=>openEmailDialog());const textBtn=$('#textClientBtn');if(textBtn)textBtn.onclick=()=>openPro('text');const followBtn=$('#followUpBtn');if(followBtn)followBtn.onclick=()=>openPro('followup');const clientBtn=$('#clientLinkBtn');if(clientBtn)clientBtn.onclick=()=>requirePro('client',async()=>{try{const d=await createCloudDocument();if(d?.public_url)window.open(d.public_url,'_blank','noopener')}catch(err){alert(err?.message||'Could not create client link')}});const proToolsBtn=$('#proToolsBtn');if(proToolsBtn)proToolsBtn.onclick=()=>openPro('pro');['closeProDialog','cancelProDialog'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#proDialog').close()});const proInterest=$('#proInterestBtn');if(proInterest)proInterest.onclick=joinProInterest;const upgrade=$('#upgradeProBtn');if(upgrade)upgrade.onclick=()=>openPro('pro');['closeEmailDialog','cancelEmailDialog'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#emailDialog').close()});const sendEmailBtn=$('#sendEmailNowBtn');if(sendEmailBtn)sendEmailBtn.onclick=sendEmailNow;const aiEmailBtn=$('#generateAiEmailBtn');if(aiEmailBtn)aiEmailBtn.onclick=generateAiEmailDraft;const autoBtn=$('#automationSettingsBtn');if(autoBtn)autoBtn.onclick=openAutomationSettings;const saveAuto=$('#saveAutomationBtn');if(saveAuto)saveAuto.onclick=saveAutomationSettings;['closeAutomationDialog','cancelAutomationDialog'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#automationDialog').close()});calc();const authOk=await initAccount();if(authOk===false)return;await activateProFromCheckout();await verifyPro();const q=new URLSearchParams(location.search);if(q.get('upgrade')==='pro'&&!proVerified)setTimeout(()=>openPro('pro'),150)}
init();