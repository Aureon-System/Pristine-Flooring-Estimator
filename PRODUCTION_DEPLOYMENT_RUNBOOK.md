# Pristine Flooring Estimator — Production Deployment Runbook

Status: Release Candidate
Domain: https://pristineflooring.online
Last preparation: 2026-09-21

## 1. Current release state

The application code is production-ready and currently configured for controlled beta testing.

Validated:
- GitHub Pages deployment from `main`
- Landing page, login and authenticated calculator
- Multi-tenant Supabase workspace + RLS
- Estimate and Invoice persistence
- Routed document preview (no `about:blank`)
- Client Estimate / Invoice view
- Estimate acceptance
- Resend transactional email
- Pro subscription architecture
- Admin / Dev Control Center
- Hourly automation scheduler
- AI automation queue + Review/Automatic modes
- Privacy, Terms and Support
- EN / PT / ES calculator interface
- Internal route and asset audit

## 2. Billing environment switch

File: `billing-config.js`

Current:
```js
environment: "sandbox"
```

Production switch:
1. Create the live Stripe product, monthly price ($12.99) and payment link.
2. Put the live values into:
```js
live: {
  stripePriceId: "price_...",
  checkoutUrl: "https://buy.stripe.com/..."
}
```
3. Change:
```js
environment: "live"
```

Do not change application billing logic when going live.

## 3. Stripe Live requirements

Before changing the environment to `live`:
- Connect/authorize the Stripe Live account.
- Create live product: Pristine Flooring Estimator Pro.
- Create recurring monthly price: USD 12.99.
- Configure the live checkout/payment link redirect:
  `https://pristineflooring.online/calculator.html?billing=success&session_id={CHECKOUT_SESSION_ID}`
- Create a live webhook endpoint targeting:
  `https://lueomnmkbbrllxbnpxph.supabase.co/functions/v1/pristine-api?action=stripe-webhook`
- Store the live webhook signing secret as `STRIPE_WEBHOOK_SECRET` in the Supabase Edge Function environment.
- Confirm the webhook receives subscription and invoice lifecycle events.

Recommended Stripe events:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed

## 4. OpenAI production activation

The Pro AI architecture is deployed but requires the production API secret.

Set these Supabase Edge Function environment variables:
- `OPENAI_API_KEY`
- Optional: `OPENAI_MODEL=gpt-5.6-luna`

Never put the OpenAI API key in GitHub, `app.js`, `billing-config.js`, or any browser-accessible file.

After activation, verify Admin > System Health shows OpenAI as active.

## 5. Authentication hardening

In Supabase Dashboard:
- Auth > Security / Password Security
- Enable Leaked Password Protection.

Current RLS policies and tenant ownership are enabled.

## 6. Known non-blocking database note

Three historical Estimate records predate the multi-tenant architecture and have no `partner_id`.

They are intentionally retained but excluded from current Admin product KPIs.

Do not delete them unless historical test data cleanup is explicitly approved.

Supabase may report `pg_net` in the public schema. The extension is used by the hourly automation scheduler and is not relocatable in the current project configuration.

## 7. Production smoke test

Run these tests after live credentials are configured:

1. Create a brand-new user with a real email.
2. Confirm account email.
3. Sign in.
4. Create company branding.
5. Create and save an Estimate.
6. Sign out and sign back in; confirm Estimate persists.
7. Open internal preview; confirm URL is `document-preview.html?key=...`.
8. Print / Save PDF.
9. Convert Estimate to Invoice.
10. Confirm Invoice persists.
11. Purchase Pro using a real low-risk production test account if appropriate.
12. Confirm Pro entitlement becomes active for the company.
13. Send a customer Estimate by email.
14. Open secure Client View.
15. Accept the Estimate.
16. Generate an AI email draft.
17. Enable an automation rule in Review mode.
18. Confirm a task appears in the review queue when conditions are met.
19. Verify Admin metrics, subscription and billing event.
20. Test on iPhone and Android/mobile Chrome/Safari.

## 8. Go-live criteria

Launch only when all are true:
- [ ] GitHub Pages latest `main` build successful
- [ ] OpenAI production secret configured
- [ ] Stripe Live account connected
- [ ] Live product/price/payment link configured
- [ ] Live Stripe webhook configured and verified
- [ ] Billing environment changed from sandbox to live
- [ ] Leaked Password Protection enabled
- [ ] Full production smoke test passed
- [ ] No Critical tester bugs open
- [ ] Mobile primary workflow validated

## 9. Rollback

If production billing or Pro activation fails:
1. Change `billing-config.js` environment back to `sandbox` or disable the Pro checkout CTA.
2. Do not delete user documents.
3. Keep Free workspace operational.
4. Fix webhook/entitlement issue before restoring live checkout.
