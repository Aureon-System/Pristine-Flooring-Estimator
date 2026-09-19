# Pristine Flooring Estimator — Monetization Architecture

## Product model
Free estimator remains useful without signup. Monetization happens after an estimate is created.

### Free
- Estimates and invoices
- PDF/print
- Partner branding
- Local saved documents
- Pristine material quote requests

### Pro
- Cloud documents
- Email estimate/invoice
- SMS/text customer
- Automated follow-up
- Client web view
- Estimate acceptance
- Delivery/activity history

### Business (later)
- Multiple users
- Analytics
- Lead management
- Integrations
- Advanced automation

## Stack
- Cloudflare Workers + Static Assets
- Supabase Postgres/Auth
- Resend for transactional email
- SMS provider behind a server-side adapter
- Stripe Checkout + Customer Portal

## Server endpoints planned
- POST /api/material-leads
- POST /api/documents
- GET /api/public/documents/:token
- POST /api/public/documents/:token/accept
- POST /api/communications/email
- POST /api/communications/sms
- POST /api/stripe/checkout
- POST /api/stripe/portal
- POST /api/stripe/webhook
- POST /api/resend/webhook

All provider secrets stay server-side. Client code never receives service-role, Resend, SMS, or Stripe secret keys.
