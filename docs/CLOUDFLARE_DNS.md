# Cloudflare DNS — pristineflooring.online

## Current intended setup

- Public app domain: `pristineflooring.online`
- Existing fallback app: `https://pristine-flooring-estimator.elciousa001.workers.dev`
- Transactional email subdomain: `mail.pristineflooring.online`
- Transactional sender: `Pristine Estimator <estimates@mail.pristineflooring.online>`

## Resend DNS records

| Type | Name | Value / Target | Priority | Proxy |
|---|---|---|---:|---|
| TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIqWZ6111xga0XnXmpfkcw0cLfBMy2WHo97/lzsb/P4XyUwi6+h4AZX1LW2SE8LFFOrTC+gt1XT7wVOcKEMyZOoSUV7mkV7N0penRdm/t3bYpaN2F7EWKGmiFXvvbIMLS+5ZsBo8FfBnHS0KRQIFN2tPYOVOZHX/DxbLsbKg+g+wIDAQAB` | — | DNS only |
| MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com` | 10 | DNS only |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | — | DNS only |
| CNAME | `rsend.mail` | `send.forge.rmta.net` | — | DNS only |

## Worker custom domain

In Cloudflare Workers & Pages, open `pristine-flooring-estimator` and attach:

`pristineflooring.online`

Keep the Workers.dev URL enabled as a fallback during rollout.

Do not switch Stripe redirects or production APP_URL until the custom domain resolves successfully over HTTPS.
