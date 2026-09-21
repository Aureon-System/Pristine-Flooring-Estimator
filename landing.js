const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
let mode='signin';

function setMessage(message,error=false){const el=$('#authMessage');el.textContent=message||'';el.classList.toggle('error',!!error)}
function setMode(next){
  mode=next;
  const signup=mode==='signup', reset=mode==='reset';
  $('#authTitle').textContent=signup?'Create free account':reset?'Reset password':'Sign in';
  $('#authIntro').textContent=signup?'Create a secure company workspace for estimates and invoices.':reset?'We will email you a secure password reset link.':"Access your company's saved estimates and invoices.";
  $('#companyField').classList.toggle('hidden',!signup);
  $('#passwordField').classList.toggle('hidden',reset);
  $('#authPrimaryBtn').textContent=signup?'Create free account':reset?'Send reset link':'Sign in';
  $('#toggleAuthMode').textContent=mode==='signin'?'Create a free account':'Back to sign in';
  $('#forgotPasswordBtn').classList.toggle('hidden',mode!=='signin');
  $('#authPassword').autocomplete=signup?'new-password':'current-password';
  setMessage('');
}
function openAuth(next='signin'){
  setMode(next);
  $('#authDialog').showModal();
  setTimeout(()=>$('#authEmail').focus(),50);
}
async function goToCalculator(){location.href='calculator.html'}
async function signIn(){
  const email=$('#authEmail').value.trim(),password=$('#authPassword').value;
  if(!email||!password)return setMessage('Enter your email and password.',true);
  setMessage('Signing in...');
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error)return setMessage(error.message,true);
  setMessage('Signed in. Opening your workspace...');
  goToCalculator();
}
async function signUp(){
  const company=$('#authCompany').value.trim(),email=$('#authEmail').value.trim(),password=$('#authPassword').value;
  if(!company||!email||password.length<6)return setMessage('Enter company name, a valid email and a password with at least 6 characters.',true);
  setMessage('Creating account...');
  const redirectTo=new URL('calculator.html',location.href).href;
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{company_name:company},emailRedirectTo:redirectTo}});
  if(error)return setMessage(error.message,true);
  if(data.session){setMessage('Account created. Opening your workspace...');goToCalculator()}
  else setMessage('Account created. Check your email to confirm the account, then return here to sign in.');
}
async function resetPassword(){
  const email=$('#authEmail').value.trim();
  if(!email)return setMessage('Enter your email address first.',true);
  setMessage('Sending reset link...');
  const redirectTo=new URL('calculator.html?reset=1',location.href).href;
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)return setMessage(error.message,true);
  setMessage('Password reset email sent. Check your inbox.');
}
async function primary(){if(mode==='signin')return signIn();if(mode==='signup')return signUp();return resetPassword()}
function bind(id,fn){const el=$(id);if(el)el.addEventListener('click',fn)}
bind('#openLoginTop',()=>openAuth('signin'));
bind('#heroAccountBtn',()=>openAuth('signup'));
bind('#freeAccountBtn',()=>openAuth('signup'));
bind('#proAccountBtn',()=>openAuth('signin'));
bind('#closeAuth',()=>$('#authDialog').close());
bind('#authPrimaryBtn',primary);
bind('#toggleAuthMode',()=>setMode(mode==='signin'?'signup':'signin'));
bind('#forgotPasswordBtn',()=>setMode('reset'));
$('#authPassword').addEventListener('keydown',e=>{if(e.key==='Enter')primary()});
$('#authEmail').addEventListener('keydown',e=>{if(e.key==='Enter'&&mode==='reset')primary()});

(async()=>{
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  if(hash.get('error_description')){openAuth('signin');setMessage(hash.get('error_description'),true)}
  const {data}=await sb.auth.getSession();
  if(data.session){
    const top=$('#openLoginTop');
    top.textContent='Open workspace';
    top.onclick=goToCalculator;
    $('#heroAccountBtn').textContent='Open my workspace';
    $('#heroAccountBtn').onclick=goToCalculator;
    $('#freeAccountBtn').textContent='Open my workspace';
    $('#freeAccountBtn').onclick=goToCalculator;
  }
})();