import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

async function exists(path){try{await access(path,constants.F_OK);return true;}catch{return false;}}

test('safe public bundle contains required app assets', async()=>{
  for(const path of ['index.html','calculator.html','app.js','styles.css','404.html']) {
    assert.equal(await exists(join('dist',path)),true,`missing dist/${path}`);
  }
});

test('internal repository surfaces are excluded from dist', async()=>{
  for(const path of ['README.md','PRODUCTION_DEPLOYMENT_RUNBOOK.md','package.json','wrangler.jsonc','backend','supabase','docs','.github']) {
    assert.equal(await exists(join('dist',path)),false,`dist unexpectedly contains ${path}`);
  }
});

test('Cloudflare deploys only dist and returns real 404s', async()=>{
  const cfg=JSON.parse(await readFile('wrangler.jsonc','utf8'));
  assert.equal(cfg.assets.directory,'./dist');
  assert.equal(cfg.assets.not_found_handling,'404-page');
});

test('billing remains sandbox until live Stripe is configured', async()=>{
  const billing=await readFile('billing-config.js','utf8');
  assert.match(billing,/environment:\s*["']sandbox["']/);
  const live=billing.match(/live:\s*\{([\s\S]*?)\}/)?.[1]??'';
  assert.match(live,/stripePriceId:\s*["']["']/);
  assert.match(live,/checkoutUrl:\s*["']["']/);
});


test('material opportunities round catalog quantities up to full boxes', async()=>{
  const app=await readFile('app.js','utf8');
  assert.match(app,/const boxes=boxCoverage>0\?Math\.ceil\(wasteTarget\/boxCoverage\):0/);
  assert.match(app,/const orderSqft=boxes>0\?boxes\*boxCoverage:wasteTarget/);
  assert.match(app,/requiredSqft:quoteRequiredSqft\(\)/);
  const calculator=await readFile('calculator.html','utf8');
  assert.match(calculator,/Order quantity/);
  assert.match(calculator,/quoteRequiredDetail/);
});


test('role routing supports Cloudflare extensionless calculator paths', async()=>{
  const app=await readFile('app.js','utf8');
  assert.match(app,/calculator\(\?:\\\.html\)\?\$\/i);
  assert.match(app,/location\.replace\('\/admin\.html'\)/);
  assert.match(app,/location\.replace\('\/distributor\.html'\)/);
});
