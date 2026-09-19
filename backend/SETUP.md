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
A Pristine-owned verified domain is required. Do not use the Track&Go domain for this product.
Set:
- `RESEND_API_KEY`
- `RESEND_FROM` e.g. `Pristine Estimator <estimates@yourdomain.com>`

### Stripe
Test-mode product/price:
- Pristine Flooring Estimator Pro
- USD 12.99 / month
Set:
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`

### Cloudflare
Set:
- `APP_URL=https://pristine-flooring-estimator.elciousa001.workers.dev`

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
