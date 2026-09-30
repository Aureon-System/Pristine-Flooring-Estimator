# Pristine Flooring Estimator — Production Deployment Runbook

Status: Release Candidate / audit hardening
Domain: https://pristineflooring.online
Frontend: Cloudflare Workers Static Assets
Backend: Supabase Edge Function `pristine-api` + Postgres/RLS

## 1. Release source of truth
- Frontend release source: GitHub `main`
- Static deployment artifact: `dist/`
- Backend source: `supabase/functions/pristine-api/`
- Database source: versioned files under `supabase/migrations/`

Do not edit production backend logic only in the Supabase Dashboard. Any production source must be captured in Git first.

## 2. Required validation before merge
```bash
npm run ci
```

The validation gate checks JavaScript syntax, builds a safe static bundle and runs release tests.

## 3. Cloudflare deployment
`wrangler.jsonc` must point to:
```json
{
  "assets": {
    "directory": "./dist",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

After deployment:
```bash
npm run smoke:production
```

Internal paths such as `/backend/SETUP.md`, `/wrangler.jsonc`, `/package.json` and `/supabase/migrations/...` must return 404.

## 4. Supabase backend
Before changing the production Edge Function:
1. Confirm the active version and capture its exact source in Git.
2. Compare intended changes against the versioned source.
3. Deploy only reviewed changes.
4. Confirm the new function version is ACTIVE and inspect logs for 5xx errors.

The current production snapshot is Network v33 and uses `verify_jwt=false`, so route-level authorization remains a mandatory security boundary. Splitting authenticated user routes, public document routes, Stripe webhook and automation runner into separate functions is a follow-up hardening project, not part of this frontend release.

## 5. Database migrations
The Git migration history must be reconciled with the linked production project before release sign-off. Do not invent missing SQL from migration names alone.

Validation target:
- remote migration history explained and mirrored locally;
- current schema reproducible from versioned migration files;
- reset/rebuild validation passes in a controlled environment.

## 6. Billing environment
Current:
```js
environment: "sandbox"
```

Do not switch to live until all are complete:
- Stripe Live account connected;
- live Pristine Pro product created;
- recurring monthly price USD 12.99 created;
- live payment link configured;
- live webhook created and signature verified;
- production entitlement flow tested.

## 7. Authentication hardening
Enable Supabase Leaked Password Protection before production sign-off.

## 8. Production acceptance flow
Validate:
1. Signup and email confirmation.
2. Login.
3. Company branding.
4. Create/save Estimate.
5. Sign out/in and confirm persistence.
6. Preview and PDF.
7. Convert Estimate to Invoice.
8. Secure Client View.
9. Estimate acceptance.
10. Partner Center.
11. Distributor workspace.
12. Admin authorization.
13. Resend email.
14. Billing sandbox.
15. Automation runner authorization.
16. Mobile Chrome/Safari workflow.

## 9. Go-live criteria
- [ ] `validate` workflow green
- [ ] `main` protected with PR + required check
- [ ] Cloudflare deployment tied to release SHA
- [ ] Internal asset paths return 404
- [ ] Production smoke passes
- [ ] `pristine-api` production source versioned in Git
- [ ] Migration history reconciled
- [ ] Leaked Password Protection enabled
- [ ] No critical tester bugs open
- [ ] Billing remains sandbox until Stripe Live is intentionally approved

## 10. Rollback
Frontend:
```bash
git revert <release-commit>
git push origin main
```

Backend rollback is permitted only after the known-good production Edge Function is versioned in Git.

Billing rollback remains independent: revert to `sandbox` or disable the Pro checkout CTA without taking the Free workspace offline.
