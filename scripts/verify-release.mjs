import { readFile } from 'node:fs/promises';

const requiredIgnoreRules = [
  'backend/**',
  'supabase/**',
  'docs/**',
  'scripts/**',
  'tests/**',
  '*.md',
  'package.json',
  'wrangler.jsonc'
];

const wranglerText = await readFile('wrangler.jsonc', 'utf8');
const wrangler = JSON.parse(wranglerText.replace(/^\s*\/\/.*$/gm, ''));
const ignoreText = await readFile('.assetsignore', 'utf8');
const billingText = await readFile('billing-config.js', 'utf8');

if (wrangler.assets?.directory !== '.') {
  throw new Error('Unexpected Cloudflare assets directory; review release strategy before deploying.');
}

if (wrangler.assets?.not_found_handling !== '404-page') {
  throw new Error('Cloudflare must return a real 404 for unknown paths.');
}

for (const rule of requiredIgnoreRules) {
  if (!ignoreText.split(/\r?\n/).includes(rule)) {
    throw new Error(`Missing .assetsignore rule: ${rule}`);
  }
}

if (!/environment:\s*["']sandbox["']/.test(billingText)) {
  throw new Error('Billing must remain in sandbox until Stripe live configuration is complete.');
}

const liveBlock = billingText.match(/live:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
if (!/stripePriceId:\s*["']["']/.test(liveBlock) || !/checkoutUrl:\s*["']["']/.test(liveBlock)) {
  throw new Error('Live billing values must remain empty until production Stripe is approved.');
}

console.log('Release configuration verified.');
