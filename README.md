# Pristine Flooring Estimator

Pristine is a multi-tenant flooring estimating and commercial workflow application.

## Architecture
- Frontend: Cloudflare Workers Static Assets
- Backend: Supabase Auth, Postgres/RLS and Edge Function `pristine-api`
- Transactional email: Resend
- Billing: Stripe (currently sandbox)
- AI features: OpenAI through the Supabase Edge Function

## Included
- Customer/project information
- Square footage + waste factor
- Flooring material and installation pricing
- Installation patterns
- Add-ons
- Estimate and Invoice persistence
- Partner Network and distributor workflow
- Admin / Dev controls
- Secure client document view
- EN / PT / ES calculator interface

## Build and validation
```bash
npm run ci
```

The build creates `dist/` from an explicit public-file allow-list. Internal repository content such as `backend/`, `supabase/`, documentation and CI files must never be part of the deployed static bundle.

## Deployment
Cloudflare Workers deploys the contents of `./dist` from `main`. Production releases should be merged through PR after the `validate` workflow passes.

## Backend source of truth
The production Edge Function must be versioned under `supabase/functions/pristine-api/`. Database migrations must remain synchronized with the linked Supabase project.

## Billing
Billing remains in `sandbox` until live Stripe product, price, payment link and webhook are configured and verified.

## Domains
- Primary: `pristineflooring.online`
- Transactional email: `mail.pristineflooring.online`
- Sender: `Pristine Estimator <estimates@mail.pristineflooring.online>`

## Pricing model
- Daily labor input is total **Daily crew cost**, not per-person rate.
- Labor cost per sqft = Daily crew cost × work days / area sqft.
- Older locally saved documents are normalized on load to preserve prior labor totals.
