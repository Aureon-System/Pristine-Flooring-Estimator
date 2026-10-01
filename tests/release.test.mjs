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
  assert.ok(app.includes("const isCalculatorPath=/(?:^|\\/)calculator(?:\\.html)?$/i.test(normalizedPath);"));
  assert.match(app,/location\.replace\('\/admin\.html'\)/);
  assert.match(app,/location\.replace\('\/distributor\.html'\)/);
});


test('multi-tenant network release includes inventory, installer links and points', async()=>{
  const api=await readFile('supabase/functions/pristine-api/index.ts','utf8');
  for(const action of [
    'installer-catalog','partner-rewards-summary','distributor-create-installer-invite',
    'distributor-update-installer','distributor-adjust-points','distributor-add-offer',
    'admin-inventory-validate','admin-inventory-publish','admin-create-distributor'
  ]) assert.ok(api.includes(action), 'missing API action '+action);
  for(const path of [
    'supabase/migrations/20261001011527_multi_tenant_inventory_rewards.sql',
    'supabase/migrations/20261001012135_multi_tenant_scaling_indexes.sql',
    'supabase/migrations/20261001012739_atomic_inventory_publish.sql'
  ]) assert.equal(await exists(path),true,'missing '+path);
  const admin=await readFile('admin.html','utf8');
  assert.match(admin,/DAILY INDUSTRY INVENTORY/);
  assert.match(admin,/exceljs@4\.4\.0/);
  const distributor=await readFile('distributor.html','utf8');
  assert.match(distributor,/Installer network/);
  assert.match(distributor,/Industry stock/);
  const calculator=await readFile('calculator.html','utf8');
  assert.match(calculator,/Reward points/);
});

test('installer catalog is server-scoped to linked distributor', async()=>{
  const app=await readFile('app.js','utf8');
  assert.match(app,/action=installer-catalog/);
  const api=await readFile('supabase/functions/pristine-api/index.ts','utf8');
  assert.match(api,/distributor_installers/);
  assert.match(api,/installerLink\?\.distributor_id \|\| await routeDistributor/);
});
