const SUPABASE_URL='https://lueomnmkbbrllxbnpxph.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_TmhHu9-ncOfBaij_xlCdmw_X7B0wLzG';
const PRISTINE_API='https://lueomnmkbbrllxbnpxph.supabase.co/functions/v1/pristine-api';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
let mode='signin';
let postAuthTarget='calculator.html';

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
async function goToCalculator(){location.href=postAuthTarget||'calculator.html'}
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
  try{
    const r=await fetch(PRISTINE_API+'?action=auth-signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company,email,password,website:''})});
    const d=await r.json();
    if(!r.ok||!d.ok)return setMessage(d.error||'Could not create account.',true);
    setMessage('Account created. We sent a confirmation email from Pristine Estimator. Check your inbox and spam folder.');
  }catch(e){setMessage('Could not create account. Please try again.',true)}
}
async function resetPassword(){
  const email=$('#authEmail').value.trim();
  if(!email)return setMessage('Enter your email address first.',true);
  setMessage('Sending reset link...');
  try{
    const r=await fetch(PRISTINE_API+'?action=auth-recovery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json();
    if(!r.ok||!d.ok)return setMessage(d.error||'Could not send reset email.',true);
    setMessage('Password reset email sent from Pristine Estimator. Check your inbox and spam folder.');
  }catch(e){setMessage('Could not send reset email. Please try again.',true)}
}
async function resendConfirmation(){
  const email=$('#authEmail').value.trim();
  if(!email)return setMessage('Enter your email address first.',true);
  setMessage('Sending confirmation email...');
  try{
    const r=await fetch(PRISTINE_API+'?action=auth-access-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json();
    if(!r.ok||!d.ok)return setMessage(d.error||'Could not send confirmation email.',true);
    setMessage('Confirmation/sign-in email sent from Pristine Estimator. Check your inbox and spam folder.');
  }catch(e){setMessage('Could not send confirmation email. Please try again.',true)}
}
async function primary(){if(mode==='signin')return signIn();if(mode==='signup')return signUp();return resetPassword()}
function bind(id,fn){const el=$(id);if(el)el.addEventListener('click',fn)}
bind('#openLoginTop',()=>openAuth('signin'));
bind('#openSignupTop',()=>openAuth('signup'));
bind('#heroAccountBtn',()=>openAuth('signup'));
bind('#workflowSignupBtn',()=>openAuth('signup'));
bind('#freeAccountBtn',()=>openAuth('signup'));
bind('#proAccountBtn',async()=>{const {data}=await sb.auth.getSession();postAuthTarget='calculator.html?upgrade=pro';if(data.session)goToCalculator();else openAuth('signin')});
bind('#closeAuth',()=>$('#authDialog').close());
bind('#authPrimaryBtn',primary);
bind('#toggleAuthMode',()=>setMode(mode==='signin'?'signup':'signin'));
bind('#forgotPasswordBtn',()=>setMode('reset'));
bind('#resendConfirmationBtn',resendConfirmation);
$('#authPassword').addEventListener('keydown',e=>{if(e.key==='Enter')primary()});
$('#authEmail').addEventListener('keydown',e=>{if(e.key==='Enter'&&mode==='reset')primary()});

(async()=>{
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  if(hash.get('error_description')){openAuth('signin');setMessage(hash.get('error_description'),true)}
  const {data}=await sb.auth.getSession();
  const query=new URLSearchParams(location.search);
  if(query.get('admin')==='1')postAuthTarget='admin.html';
  if(query.get('signin')==='1'||query.get('admin')==='1')openAuth('signin');
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