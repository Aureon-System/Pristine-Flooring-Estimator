const PRISTINE_API='https://lueomnmkbbrllxbnpxph.supabase.co/functions/v1/pristine-api';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const num=v=>Math.max(0,Number(v)||0);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DOC_KEY='pristine_workspace_docs_v3', BRAND_KEY='pristine_partner_brand_v3', LEAD_KEY='pristine_material_leads_v1', PRO_TOKEN_KEY='pristine_pro_token_v1';
const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const sb=window.supabase?.createClient?window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let currentSession=null,currentPartner=null,cloudSyncBusy=false;
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
function updateAccountUI(){
  const signed=Boolean(currentSession?.user);
  const email=currentSession?.user?.email||'';
  const company=currentPartner?.company_name||currentSession?.user?.user_metadata?.company_name||'';
  const title=$('#accountStatusTitle'),text=$('#accountStatusText'),bar=$('#accountStatusBar'),btn=$('#accountBtn'),statusBtn=$('#accountStatusBtn');
  if(title)title.textContent=signed?(company||'Company workspace'):'Guest workspace';
  if(text)text.textContent=signed?('Synced securely for '+(company||email)+'.'): 'Saved on this device. Sign in to sync and keep each company separate.';
  if(bar){bar.classList.toggle('guest',!signed);bar.classList.toggle('signed-in',signed)}
  if(btn)btn.textContent=signed?(company||'Account'):'Sign in';
  if(statusBtn)statusBtn.textContent=signed?'Manage account':'Sign in / Create account';
  const mode=$('#workspaceModeLabel'),modeText=$('#workspaceModeText');
  if(mode)mode.textContent=signed?'CLOUD WORKSPACE':'LOCAL WORKSPACE';
  if(modeText)modeText.textContent=signed?'Your documents are isolated by company and synced to the cloud.':'Open the estimate, review it, then edit, print, email or convert it into an invoice.';
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
  if(currentSession){await fetchCurrentPartner();await syncCloudDocuments(true)}
  updateAccountUI();
  const q=new URLSearchParams(location.search);
  if(q.get('reset')==='1'&&currentSession){setTimeout(()=>$('#resetPasswordDialog')?.showModal(),150)}
  sb.auth.onAuthStateChange(async(_event,session)=>{currentSession=session||null;if(currentSession){await fetchCurrentPartner();await syncCloudDocuments(true)}else currentPartner=null;updateAccountUI();renderSaved()});
}

let proVerified=false;
function getProToken(){try{return localStorage.getItem(PRO_TOKEN_KEY)||''}catch{return''}}
function setProToken(v){try{if(v)localStorage.setItem(PRO_TOKEN_KEY,v);else localStorage.removeItem(PRO_TOKEN_KEY)}catch{}}
async function verifyPro(){
  const token=getProToken();
  if(!token){proVerified=false;return false}
  try{
    const r=await fetch(PRISTINE_API+'?action=pro-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pro_token:token})});
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
function emailSavedDocument(d){
  requirePro('email',()=>{loadSavedDocument(d,false);openEmailDialog()});
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
    row.innerHTML=`<div><div class="doc-type">${esc(d.type)}</div><strong>${esc(d.documentNo||'-')}</strong>${d.sourceEstimateNo?`<small>From ${esc(d.sourceEstimateNo)}</small>`:''}</div><div><strong>${esc(d.client?.name||'Unnamed client')}</strong><small>${esc(d.client?.project||'')}</small></div><span>${d.issueDate||''}</span><strong>${money(d.total)}</strong><div class="saved-actions"><button class="btn btn-secondary saved-edit" type="button">Edit</button><button class="btn btn-secondary saved-pdf" type="button">PDF</button><button class="btn btn-pro-email saved-email" type="button"><span>PRO</span>Email</button>${d.type==='ESTIMATE'?'<button class="btn btn-gold saved-convert" type="button">Create invoice</button>':''}</div>`;
    row.querySelector('.saved-edit').onclick=()=>loadSavedDocument(d,true);
    row.querySelector('.saved-pdf').onclick=()=>previewDocument(d,true);
    row.querySelector('.saved-email').onclick=()=>emailSavedDocument(d);
    const convert=row.querySelector('.saved-convert');if(convert)convert.onclick=()=>convertSavedToInvoice(d);
    box.append(row);
  });
}
function brandHeader(b,type,no,date,valid){const logo=b.logoData?`<img class="doc-logo" src="${b.logoData}" alt="Company logo">`:'';const issuer=b.name?`<div class="issuer"><strong>${esc(b.name)}</strong>${b.address?`<span>${esc(b.address)}</span>`:''}<span>${[b.phone,b.email,b.license].filter(Boolean).map(esc).join(' · ')}</span></div>`:`<div class="issuer neutral"><strong>PROJECT ${type}</strong><span>Issued by the contractor / service provider</span></div>`;return `<header class="doc-head"><div class="issuer-wrap">${logo}${issuer}</div><div class="doc-meta"><strong>${type}</strong><span>${esc(no)}</span><span>Issue: ${esc(date||'')}</span>${type==='ESTIMATE'&&valid?`<span>Valid through: ${esc(valid)}</span>`:''}</div></header>`}
function docHtml(s,autoPrint=false,allowConvert=false){const b=s.brand||{},areaRows=s.areas.map(a=>`<tr><td><strong>${esc(a.description)}</strong><br><span>${esc(a.material)} · ${esc(a.pattern)} · ${num(a.durationDays)} work day${num(a.durationDays)===1?'':'s'}</span></td><td>${Math.round(a.sqft).toLocaleString()} sqft</td><td>${money(a.laborSell+a.matSell)}</td></tr>`).join(''),addonRows=s.addons.filter(a=>a.sell>0).map(a=>`<tr><td>${esc(a.name)}</td><td>${a.qty} ${esc(a.unit)}</td><td>${money(a.sell)}</td></tr>`).join(''),matNote=s.materialSell<=0?'<p class="notice"><strong>Material not included.</strong> Materials are excluded unless specifically listed in the scope.</p>':'';return `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><title>${s.type} ${esc(s.documentNo)}</title><style>.preview-toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:flex-end;gap:8px;padding:10px 0 16px;background:#fff}.preview-toolbar button{border:1px solid #cfd4da;background:#fff;color:#1b2026;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}.preview-toolbar .primary{background:#b7893f;color:#fff;border-color:#b7893f}body{font-family:Arial,sans-serif;color:#17191d;margin:36px;line-height:1.4}.doc-head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #17191d;padding-bottom:16px}.issuer-wrap{display:flex;align-items:center;gap:14px}.doc-logo{max-width:115px;max-height:72px;object-fit:contain}.issuer{display:flex;flex-direction:column;gap:3px}.issuer strong{font-size:20px}.issuer span,.doc-meta span{font-size:11px;color:#666}.doc-meta{text-align:right;display:flex;flex-direction:column;gap:3px}.doc-meta strong{font-size:18px}.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0;padding:14px;background:#f5f6f7}.client-grid strong{display:block;font-size:11px;text-transform:uppercase;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:14px}th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:2px solid #222;padding:8px}td{padding:10px 8px;border-bottom:1px solid #ddd;font-size:12px}td:nth-child(3),th:nth-child(3){text-align:right}.totals{width:330px;margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:5px 0}.totals .grand{font-size:18px;font-weight:900;border-top:2px solid #222;margin-top:6px;padding-top:9px}.notes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:25px}.notes h3{font-size:11px;text-transform:uppercase}.notes p{font-size:11px;white-space:pre-wrap}.notice{font-size:11px;background:#f7f4ee;padding:10px;border-left:3px solid #a87a38}.footer{margin-top:32px;border-top:1px solid #ddd;padding-top:10px;font-size:9px;color:#777}.neutral strong{font-size:17px}@media print{body{margin:20px}.preview-toolbar{display:none!important}}</style></head><body>${allowConvert&&s.type==='ESTIMATE'?'<div class="preview-toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button><button class="primary" type="button" onclick="if(window.opener&&window.opener.convertPendingEstimateToInvoice&&window.opener.convertPendingEstimateToInvoice()){window.close()}">Create Invoice</button></div>':''}${brandHeader(b,s.type,s.documentNo,s.issueDate,s.validThrough)}<section class="client-grid"><div><strong>Client</strong>${esc(s.client.name||'-')}<br>${esc(s.client.email||'')}<br>${esc(s.client.phone||'')}</div><div><strong>Project</strong>${esc(s.client.project||'-')}<br>${esc(s.client.address||'')}<br>Estimated duration: ${s.durationDays} work day${s.durationDays===1?'':'s'}</div></section>${matNote}<table><thead><tr><th>Scope</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>${areaRows}${addonRows}</tbody></table><div class="totals"><div><span>Subtotal</span><strong>${money(s.baseSell)}</strong></div><div><span>Discount</span><strong>− ${money(s.discount)}</strong></div>${s.taxRate>0?`<div><span>Tax (${s.taxRate}%)</span><strong>${money(s.tax)}</strong></div>`:''}<div class="grand"><span>Total</span><strong>${money(s.total)}</strong></div></div><section class="notes"><div><h3>Notes</h3><p>${esc(s.clientNotes||'')}</p></div><div><h3>Terms & payment</h3><p>${esc(s.terms||'')}</p></div></section><div class="footer">This document is issued by the company/service provider identified above. Verify measurements, site conditions, material specifications, taxes and applicable licensing requirements before acceptance.</div>${autoPrint?'<script>window.onload=()=>window.print()<\/script>':''}</body></html>`}
function previewDocument(s,autoPrint=false,allowConvert=false){if(allowConvert)pendingPreviewEstimate=JSON.parse(JSON.stringify(s));const w=window.open('','_blank');if(!w){alert('Please allow pop-ups for document preview.');return}w.document.write(docHtml(s,autoPrint,allowConvert));w.document.close()}
function currentForDocument(){const s=snapshot();if(!(s.client.name||s.client.email||s.client.phone)){alert('Add at least a client name, email or phone before generating a document.');return null}return s}
function convertToInvoice(){const s=currentForDocument();if(!s)return;if(s.type!=='ESTIMATE')return;previewDocument(s,false,true)}
function quoteAreaSqft(){return areas.reduce((s,a)=>s+num(a.sqft),0)}
function quoteRequiredSqft(){return Math.round(quoteAreaSqft()*(1+num($('#quoteWaste')?.value||10)/100))}
function refreshQuoteMetrics(){const m=$('#quoteMeasuredSqft'),r=$('#quoteRequiredSqft');if(m)m.textContent=Math.round(quoteAreaSqft()).toLocaleString()+' sqft';if(r)r.textContent=quoteRequiredSqft().toLocaleString()+' sqft'}
function openMaterialQuote(){
  const s=state(),b=loadBrand(),sel=$('#quoteMaterial');
  if(sel){sel.innerHTML=materials.filter(m=>m!=='Material not included').map(m=>'<option>'+esc(m)+'</option>').join('');const preferred=s.areas.find(a=>a.material&&a.material!=='Material not included')?.material;if(preferred)sel.value=preferred}
  $('#quoteCompany').value=b.name||s.client.name||'';
  $('#quotePhone').value=b.phone||s.client.phone||'';
  $('#quoteEmail').value=b.email||s.client.email||'';
  $('#quoteProject').value=s.client.project||'';
  $('#quoteAddress').value=s.client.address||'';
  $('#quoteWaste').value=10;
  $('#quoteNotes').value='';
  $('#quoteConsent').checked=false;
  refreshQuoteMetrics();
  $('#materialQuoteDialog').showModal();
}
function materialLeadPayload(){
  const s=state(),brand=loadBrand();
  return {
    id:id('lead'),
    createdAt:new Date().toISOString(),
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
    source:'Pristine Flooring Estimator'
  };
}
async function sendMaterialQuote(){
  const payload=materialLeadPayload();
  if(!payload.measuredSqft){alert('Add project square footage before requesting material pricing.');return}
  if(!(payload.company||payload.phone||payload.email)){alert('Add your company/name and at least one contact method.');return}
  if(!$('#quoteConsent').checked){alert('Please authorize sharing these project details with Pristine Flooring.');return}
  const sendBtn=$('#sendMaterialQuoteBtn'); if(sendBtn){sendBtn.disabled=true;sendBtn.textContent='Sending...'}
  try{
    const cloudPayload={
      company:payload.company,name:payload.company,phone:payload.phone,email:payload.email,
      project:payload.project,address:payload.address,material:payload.material,
      measured_sqft:payload.measuredSqft,waste_pct:payload.waste,required_sqft:payload.requiredSqft,
      notes:payload.notes,consent:true,website:''
    };
    const r=await fetch(PRISTINE_API+'?action=material-lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cloudPayload)});
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Could not save lead');
    payload.cloudId=d.lead?.id||null;
    const leads=loadLeads();leads.unshift(payload);saveLeads(leads);
    $('#materialQuoteDialog').close();
    alert('Material quote request sent to Pristine Flooring.');
  }catch(err){
    alert('Could not send the quote request online. Please try again. '+(err?.message||''));
  }finally{
    if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='Send quote request'}
  }
}
let currentProFeature='pro';
let pendingCloudDocument=null;

async function openEmailDialog(){
  if(!(proVerified||await verifyPro())){openPro('email');return}
  const s=currentForDocument(); if(!s)return;
  if(!s.client.email){alert('Add the customer email before sending.');return}
  $('#sendEmailTo').value=s.client.email||'';
  $('#sendEmailName').value=s.client.name||'';
  $('#sendEmailSubject').value=(loadBrand().name||'Your contractor')+' sent you a '+(s.type==='INVOICE'?'invoice':'estimate')+' '+s.documentNo;
  pendingCloudDocument=null;
  $('#emailDialog').showModal();
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
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        document_id:d.document.id,
        manage_token:d.manage_token,
        to,
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
    client:['Client view','Create a secure web link for the customer to view and accept the estimate online.']
  };
  const [title,body]=copy[feature]||['Pro feature','This feature is available in Pristine Estimator Pro.'];
  $('#proFeatureTitle').textContent=title;$('#proFeatureCopy').textContent=body;
  const btn=$('#proInterestBtn'); if(btn)btn.textContent='Upgrade to Pro · $12.99/mo';
  $('#proDialog').showModal();
}
async function createCloudDocument(){
  const s=currentForDocument(); if(!s)return null;
  const payload={document_no:s.documentNo,document_type:s.type,project_name:s.client.project,project_address:s.client.address,total:s.total,payload:s,pro_token:getProToken()};
  const r=await fetch(PRISTINE_API+'?action=document',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
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
    const r=await fetch(PRISTINE_API+'?action=activate-pro',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:sessionId})});
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
function init(){fillCatalog();resetDoc();renderSaved();renderBrandStatus();['discount','taxRate','otherInternalCosts','documentType'].forEach(id=>$('#'+id).addEventListener('input',calc));$('#addAreaBtn').onclick=()=>{areas.push(defaultArea());renderAreas()};$('#addPresetBtn').onclick=()=>{if($('#addonPreset').value!=='')addCatalog(Number($('#addonPreset').value))};$('#addCustomAddonBtn').onclick=()=>{addons.push({id:id('add'),name:'Custom work',unit:'flat',qty:1,costRate:0,sellRate:0});renderAddons()};$('#newDocBtn').onclick=()=>{if(confirm('Start a new estimate? Unsaved changes will be cleared.'))resetDoc()};$('#saveBtn').onclick=()=>{if(saveCurrent())alert('Document saved on this device.')};$('#previewBtn').onclick=()=>{const s=currentForDocument();if(s)previewDocument(s,false)};$('#downloadBtn').onclick=()=>{const s=currentForDocument();if(s)previewDocument(s,true)};$('#convertBtn').onclick=convertToInvoice;$('#clearDocsBtn').onclick=()=>{if(confirm('Clear all saved documents from this browser?'))saveDocs([])};$('#brandBtn').onclick=openBrand;$('#brandCardBtn').onclick=openBrand;const navBrand=$('#navBrandBtn');if(navBrand)navBrand.onclick=openBrand;$('#saveBrandBtn').addEventListener('click',saveBrandFromDialog);
  const accountBtn=$('#accountBtn');if(accountBtn)accountBtn.onclick=openAccountDialog;
  const accountStatusBtn=$('#accountStatusBtn');if(accountStatusBtn)accountStatusBtn.onclick=openAccountDialog;
  const closeAccount=$('#closeAccountDialog');if(closeAccount)closeAccount.onclick=()=>$('#accountDialog').close();
  const signIn=$('#signInBtn');if(signIn)signIn.onclick=signInAccount;
  const signUp=$('#signUpBtn');if(signUp)signUp.onclick=signUpAccount;
  const signOut=$('#signOutBtn');if(signOut)signOut.onclick=signOutAccount;
  const forgot=$('#forgotAccountPassword');if(forgot)forgot.onclick=requestAccountPasswordReset;
  const saveNew=$('#saveNewPasswordBtn');if(saveNew)saveNew.onclick=saveNewAccountPassword;$('#brandLogoInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>800000){alert('Please use a logo smaller than 800 KB.');return}const reader=new FileReader();reader.onload=()=>{brandLogoDraft=reader.result;$('#brandLogoPreview').innerHTML=`<img src="${reader.result}" alt="Brand logo">`};reader.readAsDataURL(f)});$('#removeBrandLogo').onclick=()=>{brandLogoDraft=null;$('#brandLogoPreview').textContent='LOGO'};$('#mobileSummaryBtn').onclick=()=>$('.summary-card').scrollIntoView({behavior:'smooth',block:'start'});const mobileSave=$('#mobileSaveBtn');if(mobileSave)mobileSave.onclick=()=>{if(saveCurrent())alert('Document saved on this device.')};const mq=$('#materialQuoteBtn');if(mq)mq.onclick=openMaterialQuote;const qm=$('#quoteWaste');if(qm)qm.addEventListener('input',refreshQuoteMetrics);const sendQ=$('#sendMaterialQuoteBtn');if(sendQ)sendQ.onclick=sendMaterialQuote;['closeMaterialQuote','cancelMaterialQuote'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#materialQuoteDialog').close()});const emailBtn=$('#emailClientBtn');if(emailBtn)emailBtn.onclick=()=>requirePro('email',openEmailDialog);const mainEmailBtn=$('#sendDocEmailBtn');if(mainEmailBtn)mainEmailBtn.onclick=()=>requirePro('email',openEmailDialog);const textBtn=$('#textClientBtn');if(textBtn)textBtn.onclick=()=>openPro('text');const followBtn=$('#followUpBtn');if(followBtn)followBtn.onclick=()=>openPro('followup');const clientBtn=$('#clientLinkBtn');if(clientBtn)clientBtn.onclick=()=>requirePro('client',async()=>{try{const d=await createCloudDocument();if(d?.public_url)window.open(d.public_url,'_blank','noopener')}catch(err){alert(err?.message||'Could not create client link')}});const proToolsBtn=$('#proToolsBtn');if(proToolsBtn)proToolsBtn.onclick=()=>openPro('pro');['closeProDialog','cancelProDialog'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#proDialog').close()});const proInterest=$('#proInterestBtn');if(proInterest)proInterest.onclick=joinProInterest;const upgrade=$('#upgradeProBtn');if(upgrade)upgrade.onclick=()=>openPro('pro');['closeEmailDialog','cancelEmailDialog'].forEach(id=>{const el=$('#'+id);if(el)el.onclick=()=>$('#emailDialog').close()});const sendEmailBtn=$('#sendEmailNowBtn');if(sendEmailBtn)sendEmailBtn.onclick=sendEmailNow;calc();initAccount();activateProFromCheckout().then(()=>verifyPro())}
init();