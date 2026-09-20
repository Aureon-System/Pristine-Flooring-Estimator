# Interface localization - English, Portuguese and Spanish

Date: 2026-09-20
Scope: implement language selection before the planned landing page, authentication, workspace and backend changes. No Supabase, Stripe, email-provider or DNS changes are included in this patch.

## User-facing behavior

- Interface choices: English, Portugues (pt-BR), Espanol (es).
- English is the initial default. Explicit choice is saved in `pristine_ui_language_v1`, separately from documents, company branding and Pro credentials. If storage is unavailable, selection works for the current page.
- Labels, help text, registered alert/confirmation messages, material/pattern options, service catalog, document actions and workspace metrics are localized.
- Switching language does not reload the page, reset input, change USD/sqft units, alter pricing or rewrite saved documents.
- English option values are preserved even when visible labels are translated. This is important for material exclusion, pattern surcharge calculations and service-unit values.
- Customer/company names, addresses, project names and all form values are excluded from UI translation.
- Estimate/Invoice templates and preconfigured document items remain English. The print/preview HTML declares `lang="en"` and `translate="no"`.
- Free-form descriptions, notes, terms and email subject must be entered in English. No automatic free-text translation service is implemented; a visible notice and field descriptions explain this limitation. Do not describe arbitrary user-written content as automatically translated.
- Existing Pro restrictions remain unchanged. This localization patch does not implement company isolation or cloud persistence.

## File boundaries

- `locales.js`: reviewed static translations; no external translation API.
- `i18n.js`: narrow UI adapter, canonical option values, dynamic UI retranslation and localized alert/confirmation bridge. No provider requests or writes to saved-document storage.
- `i18n.css`: language-selector presentation and wrapping allowances.
- `index.html`: language controls, English-document notice, additional scripts and cache versions.
- `app.js`: only document HTML language/charset attributes changed. Calculation, storage, Pro and API logic preserved.
- `styles.css`, `client-document.html`, backend and database are not changed.

## Verification performed

Baseline inspected from GitHub main commit `61e61c9910d9c44ace9a2e892a8f9512559264dc`.

Hash-verified baseline snapshots used for local DOM integration checks:
- app.js: `af3d45fea0d1550198605ecd056e0226859dc7f2`
- index.html: `df3578de9e9b789f66e3889dad2f8b982afadb4c`

Commands run during implementation:
- `node --check i18n.js`: passed.
- `node --check app.js`: passed.
- `python test_i18n.py`: 57 assertions passed, no JavaScript runtime errors. This was a temporary local browser harness, not a pre-existing repository test suite.

Covered behaviors:
1. Three language choices and switching in both directions.
2. Full draft and monetary results unchanged by language selection.
3. Total daily crew pricing retained: $600/day x 10 days = $6,000 internal cost for 3,500 sqft.
4. Pattern surcharge works with material excluded, including translated options.
5. Material inclusion/exclusion, service catalog and unit values remain canonical English.
6. Existing saved-document JSON is byte-for-byte unchanged by language switching.
7. Customer/company/project names equal to UI words are not accidentally translated.
8. Generated Estimate and Invoice HTML content is identical across all three UI languages for identical input, and declares English.
9. Estimate-to-Invoice conversion retains separate document types and invoice totals.
10. Free-user email actions still open the Pro gate in every language. No emails are sent by these tests.
11. Translated confirmation preserves cancel behavior.
12. Preference restores when remounted with retained storage; unavailable-storage behavior degrades to session-only.
13. New language-control viewport bounds and at least 44px target height at 320, 390, 412, 768 and 1440px, across all languages.

## Verification limitations

The container's browser navigation policy blocked URL navigation (including localhost/file navigation). Tests used Chromium DOM mounting, an in-memory localStorage adapter and isolated language-control styling instead. Real reload persistence, popup navigation, native iOS behavior, the entire legacy stylesheet, actual provider calls and the live Cloudflare deployment are NOT established by these tests. Do not call this a full end-to-end mobile/site audit.

Final production blob hashes matched the tested files:
- app.js: `3e0289dccc8922addcb7e1f9ee923b7225034f01`
- index.html: `68a8325a9ce27d389e4d66e2f8ff22c168537fb6`
- locales.js: `95e4d9ec4927f9c33443a402cd984177cfe0dbe8`
- i18n.js: `8aaacc38825069a225bda3fcbdda6efce334b314`
- i18n.css: `e464d088e406fa58d01d11ea2aaba6c2ae63b9bd`

## Subsequent work (not implemented here)

Use this language layer when implementing the approved landing/pricing/login flow. Complete company-owned cloud persistence and account-linked Pro access before claiming cross-device synchronization or tenant isolation. Restore the approved Pristine artwork separately. Keep manual PDF sharing free and leave the future flooring-purchase link for its own change.
