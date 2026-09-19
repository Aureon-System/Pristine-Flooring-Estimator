# Backend Activation Checklist

The worker template is intentionally not active yet.

## Required before activation

### Supabase
- Dedicated project: Pristine Flooring Estimator
- Apply `supabase/migrations/001_pristine_platform.sql`
- Set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Resend
`mail.pristineflooring.online` is the dedicated transactional email domain. DNS verification is required before sending.
Set:
- `RESEND_API_KEY`
- `RESEND_FROM=Pristine Estimator <estimates@mail.pristineflooring.online>`

### Stripe
Test-mode product/price:
- Pristine Flooring Estimator Pro
- USD 12.99 / month
Set:
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`

### Cloudflare
Primary custom domain: `pristineflooring.online`.
Keep the current Worker URL as the active `APP_URL` until DNS/custom-domain routing is configured and verified.
Current active URL:
- `APP_URL=https://pristine-flooring-estimator.elciousa001.workers.dev`

Planned production URL after domain cutover:
- `https://pristineflooring.online`

Then change `wrangler.jsonc` to:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pristine-flooring-estimator",
  "main": "backend/worker.js",
  "compatibility_date": "2026-09-19",
  "assets": {
    "directory": ".",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  }
}
```

Copy `backend/worker.template.js` to `backend/worker.js` only when provider secrets are ready.


### DNS records for Resend on Cloudflare

Create these records in the Cloudflare DNS zone for `pristineflooring.online`:

1. TXT
   - Name: `resend._domainkey.mail`
   - Content: `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIqWZ6111xga0XnXmpfkcw0cLfBMy2WHo97/lzsb/P4XyUwi6+h4AZX1LW2SE8LFFOrTC+gt1XT7wVOcKEMyZOoSUV7mkV7N0penRdm/t3bYpaN2F7EWKGmiFXvvbIMLS+5ZsBo8FfBnHS0KRQIFN2tPYOVOZHX/DxbLsbKg+g+wIDAQAB`
   - TTL: Auto

2. MX
   - Name: `send.mail`
   - Mail server: `feedback-smtp.us-east-1.amazonses.com`
   - Priority: `10`
   - TTL: Auto

3. TXT
   - Name: `send.mail`
   - Content: `v=spf1 include:amazonses.com ~all`
   - TTL: Auto

4. CNAME
   - Name: `rsend.mail`
   - Target: `send.forge.rmta.net`
   - Proxy status: DNS only
   - TTL: Auto

After the records propagate, trigger Resend domain verification.

### Custom domain cutover

Do not remove the Workers.dev hostname. Keep it as a fallback.

After the Cloudflare zone is active and the custom domain is attached to the Worker, change the production `APP_URL` to:

`https://pristineflooring.online`

Then update Stripe success/cancel redirects to the production domain.
