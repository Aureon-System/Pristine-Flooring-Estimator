# Pristine Flooring Estimator

Lightweight static MVP designed to run without a backend or paid AI-builder credits.

## Included
- Customer/project information
- Square footage + waste factor
- Flooring material and installation pricing
- Installation patterns
- Add-ons
- Live estimate total
- Local saved estimates/invoices using browser storage
- English Estimate / Invoice print-to-PDF output
- User branding fields
- Pristine sales CTA (Call / WhatsApp / Material Quote)
- Powered by Aureon Ecosystem footer
- Responsive mobile-first layout

## Hosting
Upload these three files to any static host (Cloudflare Pages, GitHub Pages, Netlify, etc.). No build step required.


## Deployment
Cloudflare Workers auto-deploys from the `main` branch via Git integration.

## Domains
- Primary brand domain: `pristineflooring.online`
- Transactional email subdomain: `mail.pristineflooring.online`
- Planned sender: `Pristine Estimator <estimates@mail.pristineflooring.online>`
- Current app host remains the Cloudflare Worker URL until the custom domain is connected in Cloudflare.
