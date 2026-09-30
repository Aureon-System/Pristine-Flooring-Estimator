import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Cloudflare unknown routes return a real 404', async () => {
  const raw = await readFile('wrangler.jsonc', 'utf8');
  const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(cfg.assets.directory, '.');
  assert.equal(cfg.assets.not_found_handling, '404-page');
});

test('internal repository surfaces are excluded from static uploads', async () => {
  const ignore = (await readFile('.assetsignore', 'utf8')).split(/\r?\n/);
  for (const rule of ['backend/**', 'supabase/**', 'docs/**', 'scripts/**', 'tests/**', '*.md', 'package.json', 'wrangler.jsonc']) {
    assert.ok(ignore.includes(rule), `missing rule ${rule}`);
  }
});

test('billing stays in sandbox until live Stripe is configured', async () => {
  const billing = await readFile('billing-config.js', 'utf8');
  assert.match(billing, /environment:\s*["']sandbox["']/);
  const live = billing.match(/live:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(live, /stripePriceId:\s*["']["']/);
  assert.match(live, /checkoutUrl:\s*["']["']/);
});

test('workspace exposes the audit hardening build marker', async () => {
  const html = await readFile('calculator.html', 'utf8');
  assert.match(html, /Build 2026\.09\.29\.1 · Network v33 · Audit hardening/);
});
