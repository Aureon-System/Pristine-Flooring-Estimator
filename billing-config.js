window.PRISTINE_BILLING = {
  environment: "sandbox",
  siteUrl: "https://pristineflooring.online",
  currentAppUrl: "https://pristineflooring.online",
  transactionalEmailDomain: "mail.pristineflooring.online",
  transactionalSender: "Pristine Estimator <estimates@mail.pristineflooring.online>",
  currency: "USD",
  plans: {
    free: {
      name: "Free",
      monthly: 0,
      features: [
        "Estimates",
        "Invoices",
        "PDF",
        "Company branding",
        "Cloud-synced workspace",
        "Material quote requests"
      ]
    },
    pro: {
      name: "Pro",
      monthly: 12.99,
      sandbox: {
        stripePriceId: "price_1UHVKiHOF48QQcVxwHeJBQpw",
        checkoutUrl: "https://buy.stripe.com/test_00w3cvawF1MZ7nQh1p4c800"
      },
      live: {
        stripePriceId: "",
        checkoutUrl: ""
      },
      features: [
        "Cloud documents",
        "AI-assisted customer emails",
        "Smart estimate follow-up",
        "AI invoice reminders & collections",
        "Automatic acceptance confirmations",
        "Secure client view",
        "Estimate acceptance",
        "Communication history"
      ]
    }
  }
};

(() => {
  const cfg = window.PRISTINE_BILLING;
  const env = cfg.environment === "live" ? "live" : "sandbox";
  const selected = cfg.plans.pro[env] || {};
  cfg.plans.pro.stripePriceId = selected.stripePriceId || "";
  cfg.plans.pro.checkoutUrl = selected.checkoutUrl || "";
  cfg.isLive = env === "live";
})();