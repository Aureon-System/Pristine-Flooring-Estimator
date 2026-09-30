const BASE=(process.env.PRISTINE_BASE_URL||'https://pristineflooring.online').replace(/\/$/,'');
const API='https://lueomnmkbbrllxbnpxph.supabase.co/functions/v1/pristine-api';

async function expectStatus(url, expected, options={}) {
  const res=await fetch(url,options);
  if(res.status!==expected) throw new Error(`${url} expected ${expected}, got ${res.status}`);
  return res;
}

await expectStatus(`${BASE}/`,200);
const calc=await expectStatus(`${BASE}/calculator.html`,200);
const html=await calc.text();
if(!html.includes('Build 2026.09.29.1 · Network v33 · Audit hardening')) {
  throw new Error('Expected release build marker was not found in production calculator.html');
}

for (const path of [
  '/wrangler.jsonc',
  '/package.json',
  '/README.md',
  '/backend/SETUP.md',
  '/supabase/migrations/001_pristine_platform.sql'
]) {
  await expectStatus(`${BASE}${path}`,404);
}

await expectStatus(`${API}?action=network-role`,401,{headers:{apikey:'invalid-public-smoke'}});
await expectStatus(`${API}?action=automation-run`,403,{method:'POST',headers:{'content-type':'application/json',apikey:'invalid-public-smoke'},body:'{}'});
await expectStatus(`${API}?action=public-document&token=invalid-smoke-token`,404,{headers:{apikey:'invalid-public-smoke'}});

console.log('Production smoke: PASS');
