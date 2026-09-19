// Pristine Flooring Estimator backend template.
// Not wired into wrangler.jsonc yet. Activate only after Supabase/Resend/Stripe secrets are configured.

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const bad = (message, status = 400) => json({ ok: false, error: message }, status);

async function supabaseInsert(env, table, payload) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured");
  }
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function supabaseSelectOne(env, table, column, value) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set(column, `eq.${value}`);
  url.searchParams.set("limit", "1");
  const r = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!r.ok) throw new Error(await r.text());
  const rows = await r.json();
  return rows[0] || null;
}

async function supabaseUpdate(env, table, column, value, patch) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set(column, `eq.${value}`);
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sendResend(env, { to, subject, text, html, replyTo }) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    throw new Error("Resend is not configured");
  }
  const payload = {
    from: env.RESEND_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html
  };
  if (replyTo) payload.reply_to = Array.isArray(replyTo) ? replyTo : [replyTo];

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function createStripeCheckout(env, email) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRO_PRICE_ID) {
    throw new Error("Stripe is not configured");
  }
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("line_items[0][price]", env.STRIPE_PRO_PRICE_ID);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", env.APP_URL + "/?billing=success");
  body.set("cancel_url", env.APP_URL + "/?billing=cancelled");
  body.set("allow_promotion_codes", "true");
  if (email) body.set("customer_email", email);

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function publicEstimateHtml(doc) {
  const p = doc.payload || {};
  const client = p.client || {};
  const brand = p.brand || {};
  return `<!doctype html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <title>${doc.document_type === "INVOICE" ? "Invoice" : "Estimate"} ${doc.document_no}</title>
  <style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;color:#171b22;margin:0;padding:24px}
  main{max-width:760px;margin:auto;background:white;border-radius:14px;padding:28px;box-shadow:0 10px 35px #00000012}
  .top{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #ddd;padding-bottom:16px}
  h1{margin:0}.total{font-size:28px;font-weight:800}.muted{color:#6d7580}.actions{display:flex;gap:10px;margin-top:22px}
  button{border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer}.accept{background:#b7893f;color:white}
  </style></head><body><main>
  <div class="top"><div><div class="muted">${brand.name || "Estimate"}</div><h1>${doc.document_type === "INVOICE" ? "Invoice" : "Estimate"} ${doc.document_no}</h1></div>
  <div class="total">$ ${Number(doc.total || 0).toFixed(2)}</div></div>
  <p><strong>Customer:</strong> ${client.name || "-"}</p>
  <p><strong>Project:</strong> ${doc.project_name || "-"}</p>
  <p><strong>Address:</strong> ${doc.project_address || "-"}</p>
  <p class="muted">This page is a web view of the document prepared by the contractor.</p>
  ${doc.document_type === "ESTIMATE" && doc.status !== "accepted" ? '<div class="actions"><button class="accept" onclick="acceptEstimate()">Accept estimate</button></div>' : ""}
  <script>
  async function acceptEstimate(){
    const name=prompt("Your name"); if(!name) return;
    const email=prompt("Your email"); if(!email) return;
    const r=await fetch(location.pathname+"/accept",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,email})});
    const d=await r.json(); if(d.ok){alert("Estimate accepted.");location.reload()}else alert(d.error||"Could not accept estimate");
  }
  </script></main></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/material-leads" && request.method === "POST") {
        const body = await request.json();
        if (!body.consent || !body.material || !body.required_sqft) return bad("Missing required material lead fields");
        const [row] = await supabaseInsert(env, "material_leads", {
          requester_company: body.company || null,
          requester_name: body.name || null,
          phone: body.phone || null,
          email: body.email || null,
          project_name: body.project || null,
          project_address: body.address || null,
          material: body.material,
          measured_sqft: Number(body.measured_sqft || 0),
          waste_pct: Number(body.waste_pct || 0),
          required_sqft: Number(body.required_sqft || 0),
          notes: body.notes || null,
          consent_at: new Date().toISOString()
        });
        return json({ ok: true, lead: row });
      }

      if (url.pathname === "/api/documents" && request.method === "POST") {
        const body = await request.json();
        const [row] = await supabaseInsert(env, "documents", {
          document_no: body.document_no,
          document_type: body.document_type,
          status: body.status || "draft",
          project_name: body.project_name || null,
          project_address: body.project_address || null,
          payload: body.payload || {},
          total: Number(body.total || 0)
        });
        return json({ ok: true, document: row, public_url: `${env.APP_URL}/d/${row.public_token}` });
      }

      if (url.pathname === "/api/communications/email" && request.method === "POST") {
        const body = await request.json();
        if (!body.to || !body.subject || !body.text) return bad("Missing email fields");
        const result = await sendResend(env, body);
        await supabaseInsert(env, "communications", {
          document_id: body.document_id || null,
          channel: "email",
          recipient: body.to,
          template_key: body.template_key || "document",
          provider_message_id: result.id || null,
          status: "sent",
          sent_at: new Date().toISOString()
        });
        return json({ ok: true, id: result.id });
      }

      if (url.pathname === "/api/stripe/checkout" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const session = await createStripeCheckout(env, body.email || "");
        return json({ ok: true, url: session.url });
      }

      const publicMatch = url.pathname.match(/^\/d\/([0-9a-f-]{36})$/i);
      if (publicMatch && request.method === "GET") {
        const doc = await supabaseSelectOne(env, "documents", "public_token", publicMatch[1]);
        if (!doc) return new Response("Not found", { status: 404 });
        if (!doc.viewed_at) await supabaseUpdate(env, "documents", "id", doc.id, { status: doc.status === "draft" ? "viewed" : doc.status, viewed_at: new Date().toISOString() });
        return new Response(publicEstimateHtml(doc), { headers: { "content-type": "text/html; charset=utf-8" } });
      }

      const acceptMatch = url.pathname.match(/^\/d\/([0-9a-f-]{36})\/accept$/i);
      if (acceptMatch && request.method === "POST") {
        const body = await request.json();
        if (!body.name || !body.email) return bad("Name and email are required");
        const doc = await supabaseSelectOne(env, "documents", "public_token", acceptMatch[1]);
        if (!doc) return bad("Document not found", 404);
        await supabaseUpdate(env, "documents", "id", doc.id, {
          status: "accepted",
          accepted_at: new Date().toISOString(),
          accepted_name: body.name,
          accepted_email: body.email
        });
        return json({ ok: true });
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return bad("Server configuration or provider error", 500);
    }
  }
};
