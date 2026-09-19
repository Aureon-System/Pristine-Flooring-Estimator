# Pristine Flooring Estimator — UX/UI & Architecture Audit V2

Date: 2026-09-19

## Review lenses
This audit treats the product through four specialist lenses: product architecture, UX/UI, mobile usability, and brand/monetization.

## Executive findings
1. The estimator has enough functionality for an MVP, but the interface had begun to expose too many actions at once.
2. The highest-risk UX issue was duplication between document actions and Growth/Pro actions.
3. Mobile must be treated as the primary viewport, not a reduced desktop layout.
4. Free vs Pro must be visually and technically distinct.
5. Saved Documents should function as the document workspace: Edit, PDF, Email (Pro), and Estimate-to-Invoice conversion.
6. The Pristine brand belongs in the product shell and sales/material areas, while client documents remain partner-branded.
7. Internal cost entry should optimize speed. The daily labor input should be one total daily crew amount, not a per-person rate.

## Target information architecture
### 1. Estimate Builder
Client & Project -> Installation -> Add-ons -> Adjustments -> Project Total.

### 2. Documents
Saved Estimates and Invoices. Actions live with the document: Edit, PDF, Email (Pro), Create Invoice.

### 3. Materials & Sales
Free Pristine material quote request and a single clear Pro upsell. Avoid duplicating the document Email action here.

### 4. Partner Brand
Partner identity used on Estimate/Invoice output. Pristine/Aureon should not replace the contractor as document issuer.

## Mobile-first requirements
- Primary controls must be at least 44px high.
- One-column form layout below 760px.
- Horizontal sticky section navigation.
- Installation areas collapse after the first area to reduce scrolling.
- Saved documents become cards rather than desktop-like rows.
- Sticky bottom bar exposes Project Total, Save, and Review.
- No action should depend on hover.
- No horizontal page scrolling.
- Summary must remain accessible without forcing a user to scroll through the full form.

## Free vs Pro
### Free
- Build Estimate
- Build Invoice
- Save locally
- Edit saved documents
- Preview / PDF
- Convert Estimate to Invoice
- Request Pristine material quote
- Partner-branded documents

### Pro
- Email Estimate / Invoice
- Client web view / acceptance
- SMS
- Automated follow-up
- Cloud communication history

Technical entitlement checks must remain server-side for protected Pro actions.

## Brand system
Product shell:
- PRISTINE FLOORING
- dark charcoal/navy
- warm white surfaces
- gold accent for primary commercial actions

Partner documents:
- partner/company branding only
- internal costs never displayed

Pristine sales surfaces:
- material quote CTA
- address and phone
- pristineflooring.online

## Pricing simplification
Previous model:
Daily rate/person x crew size x days / sqft.

New model:
Daily crew cost x days / sqft.

This removes one input and reduces repetitive entry across multiple installation areas.

## Priority roadmap
### P0 — implemented in V2 foundation
- Total Daily crew cost model
- Legacy saved-document normalization
- Mobile sticky navigation
- Collapsible installation cards on mobile
- Mobile Save + Review actions
- Simplified Sales/Pro card
- Stronger Pristine product branding

### P1 — next visual QA pass
- Validate iPhone 390px, Android 412px, tablet 768px, desktop 1440px.
- Check all dialogs for viewport overflow and keyboard interaction.
- Audit tap order and error messages.
- Reduce any remaining duplicate calls to action.

### P2 — post-auth / production
- Cloud document history for Pro
- subscription/account status UI
- customer communication timeline
- payment status and invoice lifecycle

## Acceptance criteria
- A new user can create a simple estimate on mobile without training.
- A user can understand what is Free and what requires Pro without clicking around.
- A saved Estimate can be reopened, reviewed, converted, and sent with a predictable workflow.
- Pristine branding is visible in the tool without appearing as the contractor on partner documents.
- No internal costs appear on client-facing output.
- Daily labor cost requires only one daily cost field plus duration.
