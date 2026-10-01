import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function admin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const key = keys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing Supabase secret key");
  return createClient(url, key, { auth: { persistSession: false } });
}

function clean(v: unknown, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}

function validEmail(v: string) {
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function activePro(db: any, token: unknown) {
  const raw = clean(token, 220);
  if (!raw) return null;
  const hash = await sha256(raw);
  const { data, error } = await db.from("pro_entitlements")
    .select("id,email,status,stripe_subscription_id")
    .eq("access_token_hash", hash)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function mapSubscriptionStatus(status: string) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  if (status === "unpaid") return "unpaid";
  if (status === "incomplete" || status === "incomplete_expired") return "incomplete";
  if (status === "canceled") return "canceled";
  return "pending";
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(raw: string, header: string, secret: string) {
  const parts = header.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter(p => p.startsWith("v1=")).map(p => p.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = await hmacHex(secret, timestamp + "." + raw);
  return signatures.some(s => s === expected);
}

function money(v: unknown) {
  return "$" + Number(v || 0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function escapeHtml(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" } as Record<string,string>)[c] || c);
}

async function sendDocumentEmail(req: Request, db: any, body: any) {
  const ap = await authenticatedPartner(req,db);
  let pro = ap ? await activeProForPartner(db,ap.partner.id) : null;
  if (!pro) pro = await activePro(db, body.pro_token);
  if (!pro) return json({ok:false,error:"Active Pro plan required"},402);
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ok:false,error:"Email service is not activated yet"},503);

  const docId = clean(body.document_id, 80);
  const manageToken = clean(body.manage_token, 120);
  const to = clean(body.to, 180);
  if (!docId || !manageToken || !to || !validEmail(to)) {
    return json({ok:false,error:"Missing or invalid email delivery fields"},400);
  }

  const hash = await sha256(manageToken);
  const { data: doc, error } = await db.from("documents").select("*").eq("id",docId).eq("manage_token_hash",hash).maybeSingle();
  if (error) throw error;
  if (!doc) return json({ok:false,error:"Document management token is invalid"},403);

  const oneHourAgo = new Date(Date.now()-60*60*1000).toISOString();
  const { count } = await db.from("communications")
    .select("id",{count:"exact",head:true})
    .eq("document_id",doc.id)
    .eq("channel","email")
    .gte("created_at",oneHourAgo);
  if ((count || 0) >= 5) return json({ok:false,error:"Hourly email limit reached for this document"},429);

  const p = doc.payload || {};
  const partner = p.brand || {};
  const client = p.client || {};
  const partnerName = clean(partner.name || "Your contractor",160);
  const customerName = clean(client.name || "Customer",160);
  const projectName = clean(doc.project_name || client.project || "Your project",180);
  const publicUrl = `https://pristineflooring.online/client-document.html?token=${doc.public_token}`;
  const customSubject = clean(body.subject,180);
  const customMessage = clean(body.message,1800);
  const messageHtml = customMessage
    ? `<p style="font-size:15px;line-height:23px;color:#5d6570;white-space:pre-line">${escapeHtml(customMessage)}</p>`
    : `<p style="font-size:15px;color:#5d6570">Hi ${escapeHtml(customerName)}, your project document is ready to review.</p>`;

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f5f7;padding:24px;color:#171b22"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border-radius:12px"><tr><td style="padding:28px"><p style="font-size:12px;color:#8b6a35;font-weight:bold;letter-spacing:1px">${doc.document_type}</p><h1 style="font-size:26px;margin:0 0 12px">${partnerName} sent you a ${doc.document_type.toLowerCase()}</h1>${messageHtml}<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f5ef;border-radius:10px;margin-top:20px"><tr><td style="padding:18px"><p style="font-size:12px;color:#7a8088;margin:0 0 4px">Document</p><p style="font-size:16px;font-weight:bold;margin:0 0 12px">${doc.document_no}</p><p style="font-size:12px;color:#7a8088;margin:0 0 4px">Project</p><p style="font-size:15px;margin:0 0 12px">${projectName}</p><p style="font-size:12px;color:#7a8088;margin:0 0 4px">Total</p><p style="font-size:24px;font-weight:bold;margin:0">${money(doc.total)}</p></td></tr></table><p style="margin-top:22px"><a href="${publicUrl}" style="background:#b7893f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold">View document</a></p><p style="font-size:11px;line-height:18px;color:#8a9098;margin-top:22px">Sent through Pristine Flooring Estimator on behalf of ${partnerName}. The estimate or invoice is issued by the contractor shown in the document.</p></td></tr></table></td></tr></table></body></html>`;

  const resend = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      from:"Pristine Estimator <estimates@mail.pristineflooring.online>",
      to:[to],
      subject:customSubject || `${partnerName} sent you a ${doc.document_type.toLowerCase()} ${doc.document_no}`,
      html,
      text:customMessage ? `${customMessage}\n\nView document: ${publicUrl}` : `${partnerName} sent you ${doc.document_type} ${doc.document_no} for ${projectName}. Total: ${money(doc.total)}. View: ${publicUrl}`,
      reply_to: partner.email ? [clean(partner.email,180)] : undefined
    })
  });
  const result = await resend.json();
  if (!resend.ok) throw new Error(result?.message || "Resend delivery failed");

  await db.from("communications").insert({
    document_id:doc.id,
    document_public_token:doc.public_token,
    channel:"email",
    recipient:to,
    template_key:"pristine-customer-document",
    provider_message_id:result.id || null,
    status:"sent",
    sent_at:new Date().toISOString(),
    metadata:{document_no:doc.document_no}
  });

  await db.from("documents").update({status:doc.status==="draft"?"sent":doc.status}).eq("id",doc.id);
  return json({ok:true,id:result.id,public_url:publicUrl});
}

async function sendAuthEmail(db: any, {to, subject, headline, copy, actionLabel, actionLink, templateKey}: any) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Email service is not activated yet");
  const since = new Date(Date.now()-10*60*1000).toISOString();
  const { count } = await db.from("communications")
    .select("id",{count:"exact",head:true})
    .eq("recipient",to)
    .eq("channel","email")
    .eq("template_key",templateKey)
    .gte("created_at",since);
  if ((count || 0) >= 3) return {rateLimited:true};

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#171b22"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 16px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#fff;border-radius:14px"><tr><td style="padding:32px"><p style="font-size:11px;font-weight:bold;letter-spacing:1.4px;color:#9b7131;margin:0 0 14px">PRISTINE FLOORING ESTIMATOR</p><h1 style="font-size:26px;margin:0 0 14px">${headline}</h1><p style="font-size:15px;line-height:23px;color:#5d6570;margin:0 0 24px">${copy}</p><a href="${actionLink}" style="display:inline-block;background:#b7893f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold">${actionLabel}</a><p style="font-size:11px;line-height:18px;color:#8a9098;margin:26px 0 0">If you did not request this, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`;

  const resend = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      from:"Pristine Estimator <estimates@mail.pristineflooring.online>",
      to:[to],
      subject,
      html,
      text:`${headline}\n\n${copy}\n\n${actionLink}`
    })
  });
  const result = await resend.json();
  if (!resend.ok) throw new Error(result?.message || "Resend delivery failed");

  await db.from("communications").insert({
    channel:"email",
    recipient:to,
    template_key:templateKey,
    provider_message_id:result.id || null,
    status:"sent",
    sent_at:new Date().toISOString(),
    metadata:{purpose:"auth"}
  });
  return {ok:true,id:result.id};
}

async function generateAndSendAuthLink(db: any, type: "recovery"|"magiclink", email: string) {
  const redirectTo = type === "recovery"
    ? "https://pristineflooring.online/calculator.html?reset=1"
    : "https://pristineflooring.online/calculator.html";
  const { data, error } = await db.auth.admin.generateLink({
    type,
    email,
    options:{redirectTo}
  });
  if (error || !data?.properties?.action_link) return {ok:true};
  const recovery = type === "recovery";
  const sent = await sendAuthEmail(db,{
    to:email,
    subject:recovery ? "Reset your Pristine Estimator password" : "Your Pristine Estimator sign-in link",
    headline:recovery ? "Reset your password" : "Confirm your email and open your workspace",
    copy:recovery ? "Use the secure link below to choose a new password." : "Use the secure link below to confirm your email and open your company workspace.",
    actionLabel:recovery ? "Reset password" : "Open my workspace",
    actionLink:data.properties.action_link,
    templateKey:recovery ? "auth-recovery" : "auth-access-link"
  });
  return sent?.rateLimited ? {ok:false,rateLimited:true} : {ok:true};
}

async function authenticatedUser(req: Request, db: any) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function authenticatedPartner(req: Request, db: any) {
  const user = await authenticatedUser(req, db);
  if (!user) return null;
  const { data, error } = await db.from("partners").select("*").eq("owner_id", user.id).maybeSingle();
  if (error) throw error;
  return data ? { user, partner: data } : null;
}



async function routeDistributor(db: any, input: {catalogVariantId?:string|null,state?:string,county?:string,zip?:string,fallbackId?:string|null}) {
  const state=clean(input.state,40).toUpperCase();
  const county=clean(input.county,100).toLowerCase().replace(/\s+county$/,'');
  const zip=clean(input.zip,20);
  const fallback=clean(input.fallbackId,80);
  let candidateIds:string[]=[];
  if(input.catalogVariantId){
    const {data:offers,error}=await db.from("distributor_offers")
      .select("distributor_id,distributors(id,active)")
      .eq("variant_id",input.catalogVariantId)
      .eq("active",true);
    if(error)throw error;
    candidateIds=[...new Set((offers||[]).filter((x:any)=>x.distributors?.active!==false).map((x:any)=>x.distributor_id).filter(Boolean))] as string[];
  }
  if(!candidateIds.length){
    const {data:dist,error}=await db.from("distributors").select("id").eq("active",true);
    if(error)throw error;
    candidateIds=(dist||[]).map((x:any)=>x.id);
  }
  if(!candidateIds.length)return null;
  const {data:territories,error:tErr}=await db.from("distributor_territories")
    .select("distributor_id,state_code,county_name,zip_prefixes,priority")
    .in("distributor_id",candidateIds)
    .eq("active",true);
  if(tErr)throw tErr;
  const scored=(territories||[]).map((t:any)=>{
    let score=0;
    const tState=clean(t.state_code,40).toUpperCase();
    const tCounty=clean(t.county_name,100).toLowerCase().replace(/\s+county$/,'');
    const prefixes=Array.isArray(t.zip_prefixes)?t.zip_prefixes.map((x:any)=>clean(x,20)).filter(Boolean):[];
    if(state&&tState&&state===tState)score+=20;
    if(county&&tCounty&&county===tCounty)score+=100;
    if(zip&&prefixes.some((p:string)=>zip.startsWith(p)))score+=200;
    return {...t,score};
  }).filter((x:any)=>x.score>0).sort((a:any,b:any)=>b.score-a.score||Number(a.priority||100)-Number(b.priority||100));
  if(scored[0]?.distributor_id)return scored[0].distributor_id;
  if(fallback&&candidateIds.includes(fallback))return fallback;
  if(candidateIds.length===1)return candidateIds[0];
  return null;
}

async function authenticatedDistributor(req: Request, db: any, requestedDistributorId = "") {
  const user = await authenticatedUser(req, db);
  if (!user) return null;
  let q = db.from("distributor_members")
    .select("id,distributor_id,user_id,role,active,distributors(id,name,manufacturer_id,office_address,warehouse_address,email,phone,active)")
    .eq("user_id", user.id)
    .eq("active", true);
  if (requestedDistributorId) q = q.eq("distributor_id", requestedDistributorId);
  const { data, error } = await q.order("created_at",{ascending:true}).limit(1).maybeSingle();
  if (error) throw error;
  if(data)return { user, membership:data, distributor:data.distributors };
  if(requestedDistributorId){
    const {data:adminRow}=await db.from("platform_admins").select("role,active").eq("user_id",user.id).eq("active",true).maybeSingle();
    if(adminRow){
      const {data:dist,error:dErr}=await db.from("distributors").select("id,name,manufacturer_id,office_address,warehouse_address,email,phone,active").eq("id",requestedDistributorId).eq("active",true).maybeSingle();
      if(dErr)throw dErr;
      if(dist)return {user,membership:{id:null,distributor_id:dist.id,user_id:user.id,role:"admin_view",active:true},distributor:dist,admin_view:true};
    }
  }
  return null;
}

async function networkRole(req: Request, db: any) {
  const user = await authenticatedUser(req,db);
  if (!user) return json({ok:false,error:"Sign in required"},401);
  const [partnerR, memberR, adminR] = await Promise.all([
    db.from("partners").select("id,company_name,plan").eq("owner_id",user.id).maybeSingle(),
    db.from("distributor_members").select("id,distributor_id,role,active,distributors(id,name)").eq("user_id",user.id).eq("active",true),
    db.from("platform_admins").select("role,active").eq("user_id",user.id).eq("active",true).maybeSingle()
  ]);
  return json({
    ok:true,
    installer:partnerR.data||null,
    distributors:memberR.data||[],
    admin:adminR.data||null
  });
}

async function distributorDashboard(req: Request, db: any, url: URL) {
  const requested = clean(url.searchParams.get("distributor_id"),80);
  const ad = await authenticatedDistributor(req,db,requested);
  if (!ad) return json({ok:false,error:"Distributor access required"},403);
  const distributorId = ad.membership.distributor_id;
  const leadsR = await db.from("material_leads")
    .select("id,partner_id,requester_company,requester_name,phone,email,project_name,project_address,project_city,project_state,project_zip,material,measured_sqft,waste_pct,required_sqft,status,opportunity_type,buyer_role,estimate_no,estimate_total,product_sizes,custom_size,catalog_variant_id,product_sku,product_name,unit_price_sqft,calculated_boxes,assigned_distributor_id,created_at,updated_at,last_activity_at,partners(company_name,email)")
    .eq("assigned_distributor_id",distributorId)
    .order("last_activity_at",{ascending:false})
    .limit(250);
  if (leadsR.error) throw leadsR.error;
  const leadIds=(leadsR.data||[]).map((x:any)=>x.id);
  let quotes:any[] = [], supply:any[] = [], events:any[] = [], orders:any[] = [];
  if (leadIds.length) {
    const [qR,sR,eR,oR] = await Promise.all([
      db.from("material_quotes").select("*").eq("distributor_id",distributorId).in("material_lead_id",leadIds).order("created_at",{ascending:false}),
      db.from("manufacturer_supply_requests").select("*,catalog_manufacturers(name),catalog_variants(sku,name,size,finish)").eq("distributor_id",distributorId).in("material_lead_id",leadIds).order("created_at",{ascending:false}),
      db.from("opportunity_events").select("*").in("material_lead_id",leadIds).order("created_at",{ascending:true}).limit(1000),
      db.from("material_orders").select("*").eq("distributor_id",distributorId).in("material_lead_id",leadIds).order("created_at",{ascending:false})
    ]);
    if(qR.error)throw qR.error;if(sR.error)throw sR.error;if(eR.error)throw eR.error;if(oR.error)throw oR.error;
    quotes=qR.data||[];supply=sR.data||[];events=eR.data||[];orders=oR.data||[];
  }
  const offersR=await db.from("distributor_offers")
    .select("id,distributor_id,variant_id,price_sqft,availability,stock_sqft,lead_time_days,effective_date,active,catalog_variants(id,sku,name,size,finish,sqft_per_box,catalog_products(collection,category))")
    .eq("distributor_id",distributorId)
    .eq("active",true)
    .order("updated_at",{ascending:false});
  if(offersR.error)throw offersR.error;

  let installerNetwork:any={partner:null,referral_code:null,installers:[]};
  const {data:networkPartner,error:npErr}=await db.from("partners")
    .select("id,company_name,email")
    .eq("owner_id",ad.user.id)
    .maybeSingle();
  if(npErr)throw npErr;
  if(networkPartner){
    let {data:refCode,error:rcErr}=await db.from("referral_codes")
      .select("id,code,partner_id,active")
      .eq("partner_id",networkPartner.id)
      .eq("active",true)
      .maybeSingle();
    if(rcErr)throw rcErr;
    if(!refCode){
      for(let i=0;i<5&&!refCode;i++){
        const candidate="PF-"+crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase();
        const created=await db.from("referral_codes").insert({partner_id:networkPartner.id,code:candidate}).select("id,code,partner_id,active").single();
        if(!created.error)refCode=created.data;
      }
    }
    let installers:any[]=[];
    if(refCode?.code){
      const {data:profiles,error:pErr}=await db.from("partner_profiles")
        .select("partner_id,business_type,service_area,profile_completed,referred_by_code,created_at")
        .eq("referred_by_code",refCode.code)
        .order("created_at",{ascending:false});
      if(pErr)throw pErr;
      const partnerIds=(profiles||[]).map((x:any)=>x.partner_id).filter(Boolean);
      let partnerRows:any[]=[];
      if(partnerIds.length){
        const {data:rows,error:rErr}=await db.from("partners").select("id,company_name,email,phone,created_at").in("id",partnerIds);
        if(rErr)throw rErr;partnerRows=rows||[];
      }
      const byId=new Map(partnerRows.map((x:any)=>[x.id,x]));
      installers=(profiles||[]).map((p:any)=>({...byId.get(p.partner_id),business_type:p.business_type,service_area:p.service_area,profile_completed:p.profile_completed,created_at:p.created_at}));
    }
    installerNetwork={partner:networkPartner,referral_code:refCode||null,installers};
  }

  return json({ok:true,membership:ad.membership,distributor:ad.distributor,leads:leadsR.data||[],quotes,supply_requests:supply,events,orders,offers:offersR.data||[],installer_network:installerNetwork});
}

async function installerQuoteDecision(req: Request, db: any, body: any) {
  const ap=await authenticatedPartner(req,db);
  if(!ap)return json({ok:false,error:"Sign in required"},401);
  const quoteId=clean(body.quote_id,80);
  const decision=clean(body.decision,20);
  if(!quoteId||!["accepted","declined"].includes(decision))return json({ok:false,error:"Invalid quote decision"},400);
  const {data:quote,error:qErr}=await db.from("material_quotes")
    .select("id,material_lead_id,status,total,subtotal,freight,tax,quantity_sqft,boxes,eta_days,expires_at,distributor_id")
    .eq("id",quoteId).maybeSingle();
  if(qErr)throw qErr;if(!quote)return json({ok:false,error:"Quote not found"},404);
  if(quote.status!=="submitted")return json({ok:false,error:"This quote is no longer awaiting a decision"},409);
  if(decision==="accepted"&&quote.expires_at&&new Date(quote.expires_at).getTime()<Date.now())return json({ok:false,error:"This quote has expired. Ask the distributor for an updated quote."},409);
  const {data:lead,error:lErr}=await db.from("material_leads")
    .select("id,partner_id,status,project_address,project_city,project_state,project_zip")
    .eq("id",quote.material_lead_id).eq("partner_id",ap.partner.id).maybeSingle();
  if(lErr)throw lErr;if(!lead)return json({ok:false,error:"Opportunity not found"},404);
  const now=new Date().toISOString();
  const quoteUpdate:any={status:decision,updated_at:now};
  if(decision==="accepted")quoteUpdate.accepted_at=now;
  const {error:uErr}=await db.from("material_quotes").update(quoteUpdate).eq("id",quoteId);
  if(uErr)throw uErr;
  let order:any=null;
  if(decision==="accepted"){
    await db.from("material_quotes").update({status:"declined",updated_at:now})
      .eq("material_lead_id",lead.id).eq("status","submitted").neq("id",quoteId);
    const orderRow={
      material_lead_id:lead.id,
      quote_id:quote.id,
      distributor_id:quote.distributor_id,
      partner_id:lead.partner_id,
      status:"accepted",
      delivery_method:"delivery",
      delivery_address:lead.project_address||null,
      delivery_city:lead.project_city||null,
      delivery_state:lead.project_state||null,
      delivery_zip:lead.project_zip||null,
      quantity_sqft:Number(quote.quantity_sqft||0),
      boxes:quote.boxes||null,
      subtotal:Number(quote.subtotal||0),
      freight:Number(quote.freight||0),
      tax:Number(quote.tax||0),
      total:Number(quote.total||0),
      eta_days:quote.eta_days??null,
      accepted_by:ap.user.id,
      updated_at:now
    };
    const {data:o,error:oErr}=await db.from("material_orders").upsert(orderRow,{onConflict:"quote_id"}).select("*").single();
    if(oErr)throw oErr;order=o;
    await db.from("opportunity_events").insert({
      material_lead_id:lead.id,actor_type:"installer",actor_user_id:ap.user.id,event_type:"order_created",
      message:"Accepted quote converted into a material order.",
      metadata:{order_id:o.id,quote_id:quoteId,total:quote.total,distributor_id:quote.distributor_id}
    });
  }
  await db.from("material_leads").update({status:decision,last_activity_at:now,updated_at:now}).eq("id",lead.id);
  await db.from("opportunity_events").insert({material_lead_id:lead.id,actor_type:"installer",actor_user_id:ap.user.id,event_type:"quote_"+decision,message:decision==="accepted"?"Installer accepted the distributor quote.":"Installer declined the distributor quote.",metadata:{quote_id:quoteId,total:quote.total,distributor_id:quote.distributor_id}});
  return json({ok:true,status:decision,order});
}

async function distributorUpdateOpportunity(req: Request, db: any, body: any) {
  const distributorId=clean(body.distributor_id,80);
  const ad=await authenticatedDistributor(req,db,distributorId);
  if(!ad)return json({ok:false,error:"Distributor access required"},403);
  const leadId=clean(body.lead_id,80);
  const status=clean(body.status,40);
  const allowed=["new","distributor_review","awaiting_manufacturer","quote_ready","quoted","accepted","declined","ordered","fulfilled","lost"];
  if(!leadId||!allowed.includes(status))return json({ok:false,error:"Invalid opportunity update"},400);
  const {data:lead,error:lerr}=await db.from("material_leads").select("id,status,assigned_distributor_id").eq("id",leadId).eq("assigned_distributor_id",ad.membership.distributor_id).maybeSingle();
  if(lerr)throw lerr;if(!lead)return json({ok:false,error:"Opportunity not found"},404);
  const now=new Date().toISOString();
  const {error}=await db.from("material_leads").update({status,last_activity_at:now,updated_at:now}).eq("id",leadId);
  if(error)throw error;
  await db.from("opportunity_events").insert({material_lead_id:leadId,actor_type:"distributor",actor_user_id:ad.user.id,event_type:"status_changed",message:"Distributor changed opportunity status to "+status+".",metadata:{from:lead.status,to:status}});
  return json({ok:true,status});
}

async function distributorSubmitQuote(req: Request, db: any, body: any) {
  const distributorId=clean(body.distributor_id,80);
  const ad=await authenticatedDistributor(req,db,distributorId);
  if(!ad)return json({ok:false,error:"Distributor access required"},403);
  const leadId=clean(body.lead_id,80);
  const {data:lead,error:lerr}=await db.from("material_leads").select("id,required_sqft,calculated_boxes,assigned_distributor_id").eq("id",leadId).eq("assigned_distributor_id",ad.membership.distributor_id).maybeSingle();
  if(lerr)throw lerr;if(!lead)return json({ok:false,error:"Opportunity not found"},404);
  const quantity=Math.max(0,Number(body.quantity_sqft||lead.required_sqft||0));
  const unit=Math.max(0,Number(body.unit_price_sqft||0));
  const boxes=Math.max(0,Math.round(Number(body.boxes||lead.calculated_boxes||0)))||null;
  const freight=Math.max(0,Number(body.freight||0));
  const tax=Math.max(0,Number(body.tax||0));
  const subtotal=Math.round(quantity*unit*100)/100;
  const total=Math.round((subtotal+freight+tax)*100)/100;
  if(quantity<=0||unit<=0)return json({ok:false,error:"Quantity and unit price are required"},400);
  const now=new Date().toISOString();
  const row={material_lead_id:leadId,distributor_id:ad.membership.distributor_id,created_by:ad.user.id,status:"submitted",quantity_sqft:quantity,boxes,unit_price_sqft:unit,subtotal,freight,tax,total,eta_days:Number.isFinite(Number(body.eta_days))?Math.max(0,Math.round(Number(body.eta_days))):null,expires_at:body.expires_at||null,notes:clean(body.notes,1200)||null,submitted_at:now,updated_at:now};
  const {data:quote,error}=await db.from("material_quotes").insert(row).select("*").single();
  if(error)throw error;
  await db.from("material_leads").update({status:"quoted",last_activity_at:now,updated_at:now}).eq("id",leadId);
  await db.from("opportunity_events").insert({material_lead_id:leadId,actor_type:"distributor",actor_user_id:ad.user.id,event_type:"quote_submitted",message:"Distributor submitted a material quote.",metadata:{quote_id:quote.id,total,unit_price_sqft:unit,eta_days:row.eta_days}});
  return json({ok:true,quote});
}

async function distributorRequestSupply(req: Request, db: any, body: any) {
  const distributorId=clean(body.distributor_id,80);
  const ad=await authenticatedDistributor(req,db,distributorId);
  if(!ad)return json({ok:false,error:"Distributor access required"},403);
  const leadId=clean(body.lead_id,80);
  const {data:lead,error:lerr}=await db.from("material_leads").select("id,required_sqft,calculated_boxes,catalog_variant_id,assigned_distributor_id").eq("id",leadId).eq("assigned_distributor_id",ad.membership.distributor_id).maybeSingle();
  if(lerr)throw lerr;if(!lead)return json({ok:false,error:"Opportunity not found"},404);
  const requestedSqft=Math.max(0,Number(body.requested_sqft||lead.required_sqft||0));
  const requestedBoxes=Math.max(0,Math.round(Number(body.requested_boxes||lead.calculated_boxes||0)))||null;
  if(requestedSqft<=0)return json({ok:false,error:"Requested sqft is required"},400);
  const now=new Date().toISOString();
  const row={material_lead_id:leadId,distributor_id:ad.membership.distributor_id,manufacturer_id:ad.distributor?.manufacturer_id||null,catalog_variant_id:lead.catalog_variant_id||null,requested_sqft:requestedSqft,requested_boxes:requestedBoxes,status:"requested",request_notes:clean(body.notes,1200)||null,requested_by:ad.user.id,updated_at:now};
  const {data:request,error}=await db.from("manufacturer_supply_requests").insert(row).select("*").single();
  if(error)throw error;
  await db.from("material_leads").update({status:"awaiting_manufacturer",last_activity_at:now,updated_at:now}).eq("id",leadId);
  await db.from("opportunity_events").insert({material_lead_id:leadId,actor_type:"distributor",actor_user_id:ad.user.id,event_type:"manufacturer_supply_requested",message:"Distributor requested supply from the manufacturer.",metadata:{supply_request_id:request.id,requested_sqft:requestedSqft,requested_boxes:requestedBoxes}});
  return json({ok:true,request});
}

async function distributorUpdateOrder(req: Request, db: any, body: any) {
  const distributorId=clean(body.distributor_id,80);
  const ad=await authenticatedDistributor(req,db,distributorId);
  if(!ad)return json({ok:false,error:"Distributor access required"},403);
  const orderId=clean(body.order_id,80);
  const status=clean(body.status,40);
  const allowed=["accepted","confirmed","processing","ready","out_for_delivery","delivered","picked_up","cancelled"];
  if(!orderId||!allowed.includes(status))return json({ok:false,error:"Invalid order update"},400);
  const {data:order,error:oErr}=await db.from("material_orders").select("*")
    .eq("id",orderId).eq("distributor_id",ad.membership.distributor_id).maybeSingle();
  if(oErr)throw oErr;if(!order)return json({ok:false,error:"Order not found"},404);
  const transitions:any={
    accepted:["confirmed","cancelled"],
    confirmed:["processing","ready","cancelled"],
    processing:["ready","cancelled"],
    ready:["out_for_delivery","picked_up","cancelled"],
    out_for_delivery:["delivered","cancelled"],
    delivered:[],
    picked_up:[],
    cancelled:[]
  };
  if(status!==order.status&&!(transitions[order.status]||[]).includes(status)){
    return json({ok:false,error:"Invalid order transition from "+order.status+" to "+status},409);
  }
  const now=new Date().toISOString();
  const deliveryMethod=["delivery","pickup"].includes(clean(body.delivery_method,20))?clean(body.delivery_method,20):order.delivery_method;
  const update:any={
    status,
    delivery_method:deliveryMethod,
    scheduled_for:body.scheduled_for||null,
    tracking_reference:clean(body.tracking_reference,180)||null,
    notes:clean(body.notes,1200)||null,
    updated_at:now,
    fulfilled_at:["delivered","picked_up"].includes(status)?now:null
  };
  const {data:updated,error}=await db.from("material_orders").update(update).eq("id",orderId).select("*").single();
  if(error)throw error;
  const leadStatus=["delivered","picked_up"].includes(status)?"fulfilled":status==="cancelled"?"lost":status==="accepted"?"accepted":"ordered";
  await db.from("material_leads").update({status:leadStatus,last_activity_at:now,updated_at:now}).eq("id",order.material_lead_id);
  await db.from("opportunity_events").insert({
    material_lead_id:order.material_lead_id,actor_type:"distributor",actor_user_id:ad.user.id,event_type:"order_"+status,
    message:"Distributor updated material order to "+status+".",
    metadata:{order_id:orderId,from:order.status,to:status,delivery_method:deliveryMethod,scheduled_for:update.scheduled_for,tracking_reference:update.tracking_reference}
  });
  return json({ok:true,order:updated,lead_status:leadStatus});
}

async function distributorUpdateOffer(req: Request, db: any, body: any) {
  const distributorId=clean(body.distributor_id,80);
  const ad=await authenticatedDistributor(req,db,distributorId);
  if(!ad)return json({ok:false,error:"Distributor access required"},403);
  if(!["owner","manager"].includes(clean(ad.membership.role,40)))return json({ok:false,error:"Owner or manager access required to edit catalog pricing"},403);
  const offerId=clean(body.offer_id,80);
  const price=Math.max(0,Number(body.price_sqft||0));
  const availability=clean(body.availability,80)||"unknown";
  const allowedAvailability=["in_stock","limited","out_of_stock","special_order","unknown"];
  if(!allowedAvailability.includes(availability))return json({ok:false,error:"Invalid catalog availability"},400);
  const stock=Math.max(0,Number(body.stock_sqft||0));
  const leadTime=Math.max(0,Math.round(Number(body.lead_time_days||0)));
  if(!offerId||price<=0)return json({ok:false,error:"Offer and distributor price are required"},400);
  const {data:offer,error:oErr}=await db.from("distributor_offers").select("id,distributor_id,variant_id,price_sqft")
    .eq("id",offerId).eq("distributor_id",ad.membership.distributor_id).maybeSingle();
  if(oErr)throw oErr;if(!offer)return json({ok:false,error:"Catalog offer not found"},404);
  const now=new Date().toISOString();
  const {data:updated,error}=await db.from("distributor_offers").update({
    price_sqft:price,availability,stock_sqft:stock,lead_time_days:leadTime,effective_date:now.slice(0,10),updated_at:now
  }).eq("id",offerId).select("id,distributor_id,variant_id,price_sqft,availability,stock_sqft,lead_time_days,effective_date,active").single();
  if(error)throw error;
  return json({ok:true,offer:updated});
}

async function adminNetworkSummary(req: Request, db: any) {
  const adminRow=await requirePlatformAdmin(req,db);
  if(!adminRow)return json({ok:false,error:"Admin access required"},403);
  const [leadsR,distR,memberR,quoteR,supplyR,manR,orderR] = await Promise.all([
    db.from("material_leads").select("id,requester_company,requester_name,project_name,project_city,project_state,project_zip,material,required_sqft,status,product_sku,product_name,assigned_distributor_id,created_at,last_activity_at,partners(company_name)").order("last_activity_at",{ascending:false}).limit(300),
    db.from("distributors").select("*").order("name"),
    db.from("distributor_members").select("id,distributor_id,user_id,role,active,created_at,distributors(name)").order("created_at",{ascending:false}),
    db.from("material_quotes").select("*").order("created_at",{ascending:false}).limit(300),
    db.from("manufacturer_supply_requests").select("*,distributors(name),catalog_manufacturers(name),catalog_variants(sku,name,size,finish)").order("created_at",{ascending:false}).limit(300),
    db.from("catalog_manufacturers").select("*").eq("active",true).order("name"),
    db.from("material_orders").select("*,distributors(name),material_leads(project_name,product_name,product_sku)").order("created_at",{ascending:false}).limit(300)
  ]);
  for(const r of [leadsR,distR,memberR,quoteR,supplyR,manR,orderR])if(r.error)throw r.error;
  const leads=leadsR.data||[], supply=supplyR.data||[], quotes=quoteR.data||[], orders=orderR.data||[];
  return json({ok:true,role:adminRow.role,metrics:{
    opportunities:leads.length,
    distributor_review:leads.filter((x:any)=>["new","distributor_review","quote_ready"].includes(x.status)).length,
    awaiting_manufacturer:leads.filter((x:any)=>x.status==="awaiting_manufacturer").length,
    quoted:leads.filter((x:any)=>x.status==="quoted").length,
    accepted:leads.filter((x:any)=>["accepted","ordered","fulfilled"].includes(x.status)).length,
    open_supply_requests:supply.filter((x:any)=>x.status==="requested").length,
    quote_value:quotes.filter((x:any)=>x.status==="submitted"||x.status==="accepted").reduce((sum:number,x:any)=>sum+Number(x.total||0),0),
    open_orders:orders.filter((x:any)=>!["delivered","picked_up","cancelled"].includes(x.status)).length,
    fulfilled_orders:orders.filter((x:any)=>["delivered","picked_up"].includes(x.status)).length,
    order_value:orders.filter((x:any)=>x.status!=="cancelled").reduce((sum:number,x:any)=>sum+Number(x.total||0),0)
  },leads,distributors:distR.data||[],members:memberR.data||[],quotes,supply_requests:supply,manufacturers:manR.data||[],orders});
}

async function adminSupplyResponse(req: Request, db: any, body: any) {
  const adminRow=await requirePlatformAdmin(req,db);
  if(!adminRow)return json({ok:false,error:"Admin access required"},403);
  const user=await authenticatedUser(req,db);
  const requestId=clean(body.request_id,80);
  const status=clean(body.status,40);
  if(!["confirmed","partial","unavailable","cancelled"].includes(status))return json({ok:false,error:"Invalid supply response"},400);
  const {data:sr,error:sErr}=await db.from("manufacturer_supply_requests").select("*").eq("id",requestId).maybeSingle();
  if(sErr)throw sErr;if(!sr)return json({ok:false,error:"Supply request not found"},404);
  const now=new Date().toISOString();
  const update={status,available_sqft:Number.isFinite(Number(body.available_sqft))?Math.max(0,Number(body.available_sqft)):null,cost_sqft:Number.isFinite(Number(body.cost_sqft))?Math.max(0,Number(body.cost_sqft)):null,eta_days:Number.isFinite(Number(body.eta_days))?Math.max(0,Math.round(Number(body.eta_days))):null,response_notes:clean(body.notes,1200)||null,responded_by:user?.id||null,responded_at:now,updated_at:now};
  const {data:request,error}=await db.from("manufacturer_supply_requests").update(update).eq("id",requestId).select("*").single();
  if(error)throw error;
  const nextLeadStatus=["confirmed","partial"].includes(status)?"quote_ready":"distributor_review";
  await db.from("material_leads").update({status:nextLeadStatus,last_activity_at:now,updated_at:now}).eq("id",sr.material_lead_id);
  await db.from("opportunity_events").insert({material_lead_id:sr.material_lead_id,actor_type:"industry",actor_user_id:user?.id||null,event_type:"manufacturer_supply_response",message:"Industry responded to the distributor supply request.",metadata:{supply_request_id:requestId,status,...update}});
  return json({ok:true,request,lead_status:nextLeadStatus});
}

async function adminAddDistributorMember(req: Request, db: any, body: any) {
  const adminRow=await requirePlatformAdmin(req,db);
  if(!adminRow)return json({ok:false,error:"Admin access required"},403);
  const distributorId=clean(body.distributor_id,80);
  const email=clean(body.email,180).toLowerCase();
  const role=clean(body.role,40)||"sales";
  if(!distributorId||!email||!validEmail(email)||!["owner","manager","sales","warehouse"].includes(role))return json({ok:false,error:"Distributor, valid account email and role are required"},400);
  const {data:partner,error:pErr}=await db.from("partners").select("owner_id,email,company_name").ilike("email",email).maybeSingle();
  if(pErr)throw pErr;if(!partner?.owner_id)return json({ok:false,error:"That email must first have a Pristine account"},404);
  const {data:member,error}=await db.from("distributor_members").upsert({distributor_id:distributorId,user_id:partner.owner_id,role,active:true,updated_at:new Date().toISOString()},{onConflict:"distributor_id,user_id"}).select("id,distributor_id,user_id,role,active").single();
  if(error)throw error;
  return json({ok:true,member,account:{email:partner.email,company_name:partner.company_name}});
}


async function activeProForPartner(db: any, partnerId: string) {
  const { data, error } = await db.from("pro_entitlements")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function responseOutputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of (data?.output || [])) {
    for (const content of (item?.content || [])) {
      if (content?.type === "output_text" && content?.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}


async function buildAiDraft(db: any, partner: any, purpose: string, doc: any, tone = "professional", eventType = "message_draft") {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI service is not activated yet");

  const allowed = ["estimate_send","estimate_followup","invoice_send","invoice_reminder","acceptance_confirmation"];
  if (!allowed.includes(purpose)) throw new Error("Unsupported AI message purpose");

  const payload = doc?.payload && typeof doc.payload === "object" ? doc.payload : doc || {};
  const client = payload?.client || doc?.client || {};
  const brand = payload?.brand || doc?.brand || {};
  const context = {
    contractor: clean(brand.name || partner?.company_name || "Your flooring contractor",160),
    customer: clean(client.name || doc?.accepted_name,160),
    project: clean(client.project || doc?.project_name,180),
    document_type: clean(payload.type || doc?.document_type,40),
    document_no: clean(payload.documentNo || doc?.document_no,80),
    total: Number(payload.total ?? doc?.total ?? 0),
    issue_date: clean(payload.issueDate,40),
    valid_through_or_due: clean(payload.validThrough,40),
    notes: clean(payload.clientNotes,600),
    tone: clean(tone,40)
  };

  const instructions =
    "Write concise professional customer communication for a flooring contractor. " +
    "Use plain English and a " + context.tone + " tone. " +
    "Be warm, direct and professional. Never invent dates, discounts, promises, payment status, scope, or terms. " +
    "Do not use aggressive collection language. Keep the body under 140 words and the subject under 90 characters. " +
    "Purpose: " + purpose + ".";

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";
  const ai = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      model,
      store:false,
      reasoning:{effort:"none"},
      max_output_tokens:500,
      text:{
        format:{
          type:"json_schema",
          name:"customer_message",
          strict:true,
          schema:{
            type:"object",
            properties:{
              subject:{type:"string"},
              body:{type:"string"}
            },
            required:["subject","body"],
            additionalProperties:false
          }
        }
      },
      input:[
        {role:"developer",content:[{type:"input_text",text:instructions}]},
        {role:"user",content:[{type:"input_text",text:JSON.stringify(context)}]}
      ]
    })
  });
  const data = await ai.json();
  if (!ai.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  const raw = responseOutputText(data).trim();
  let parsed:any = null;
  try { parsed = JSON.parse(raw); } catch {}
  if (!parsed?.subject || !parsed?.body) throw new Error("AI returned an invalid draft");

  const inputTokens=Number(data?.usage?.input_tokens||0);
  const outputTokens=Number(data?.usage?.output_tokens||0);
  const estimatedCost=(inputTokens/1000000*0.20)+(outputTokens/1000000*1.20);

  await db.from("ai_activity").insert({
    partner_id:partner?.id||null,
    document_id:doc?.id||null,
    rule_key:purpose,
    event_type:eventType,
    model,
    status:"completed",
    input_tokens:inputTokens,
    output_tokens:outputTokens,
    estimated_cost:estimatedCost,
    metadata:{purpose,tone:context.tone}
  });

  return {
    subject:clean(parsed.subject,120),
    body:clean(parsed.body,1600),
    model,
    usage:{input_tokens:inputTokens,output_tokens:outputTokens,estimated_cost:estimatedCost}
  };
}

async function generateAiCustomerMessage(req: Request, db: any, body: any) {
  const ap=await authenticatedPartner(req,db);
  if(!ap)return json({ok:false,error:"Sign in required"},401);
  const entitlement=await activeProForPartner(db,ap.partner.id);
  if(!entitlement)return json({ok:false,error:"Active Pro plan required"},402);
  if(!Deno.env.get("OPENAI_API_KEY"))return json({ok:false,error:"AI service is not activated yet",code:"ai_not_configured"},503);

  const purpose=clean(body.purpose,60)||"estimate_send";
  try{
    const draft=await buildAiDraft(db,ap.partner,purpose,body.document||{},clean(body.tone,40)||"professional","message_draft");
    return json({ok:true,...draft});
  }catch(e){
    return json({ok:false,error:String((e as any)?.message||"AI draft failed")},502);
  }
}

async function automationSecretOk(req: Request, db: any) {
  const supplied=clean(req.headers.get("x-automation-secret"),200);
  if(!supplied)return false;
  const {data,error}=await db.from("platform_config").select("value").eq("key","automation_runner_secret").maybeSingle();
  if(error)throw error;
  return Boolean(data?.value && supplied===data.value);
}

function automationPurpose(ruleKey:string){
  if(ruleKey==="estimate_followup")return "estimate_followup";
  if(ruleKey==="invoice_reminder")return "invoice_reminder";
  if(ruleKey==="acceptance_confirmation")return "acceptance_confirmation";
  return "";
}

async function sendAutomationEmail(db:any, partner:any, doc:any, recipient:string, subject:string, message:string, ruleKey:string){
  const apiKey=Deno.env.get("RESEND_API_KEY");
  if(!apiKey)throw new Error("Email service is not activated yet");
  if(!validEmail(recipient))throw new Error("Valid customer email required");

  const publicUrl="https://pristineflooring.online/client-document.html?token="+doc.public_token;
  const partnerName=clean(partner?.company_name||doc?.payload?.brand?.name||"Your flooring contractor",160);
  const html='<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f5f7;padding:24px;color:#171b22"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:12px"><tr><td style="padding:28px"><p style="font-size:11px;color:#8b6a35;font-weight:bold;letter-spacing:1px">PRISTINE ESTIMATOR PRO</p><h1 style="font-size:24px;margin:0 0 14px">'+escapeHtml(subject)+'</h1><p style="font-size:15px;line-height:23px;color:#5d6570;white-space:pre-line">'+escapeHtml(message)+'</p><p style="margin-top:22px"><a href="'+publicUrl+'" style="background:#b7893f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:bold">View document</a></p><p style="font-size:10px;color:#8a9098;margin-top:24px">Sent by '+escapeHtml(partnerName)+' using Pristine Flooring Estimator Pro.</p></td></tr></table></td></tr></table></body></html>';

  const resend=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
    body:JSON.stringify({
      from:"Pristine Estimator <estimates@mail.pristineflooring.online>",
      to:[recipient],
      subject,
      html,
      text:message+"\n\nView document: "+publicUrl,
      reply_to:partner?.email?[clean(partner.email,180)]:undefined
    })
  });
  const result=await resend.json();
  if(!resend.ok)throw new Error(result?.message||"Email delivery failed");

  await db.from("communications").insert({
    partner_id:partner?.id||null,
    document_id:doc.id,
    document_public_token:doc.public_token,
    channel:"email",
    recipient,
    template_key:"ai-"+ruleKey,
    provider_message_id:result.id||null,
    status:"sent",
    sent_at:new Date().toISOString(),
    metadata:{automation:true,rule_key:ruleKey}
  });
  return result.id||null;
}

async function discoverDueAutomationTasks(db:any){
  const {data:rules,error}=await db.from("ai_automation_rules")
    .select("*")
    .eq("enabled",true)
    .in("rule_key",["estimate_followup","invoice_reminder"]);
  if(error)throw error;
  let queued=0;
  for(const rule of (rules||[])){
    const type=rule.rule_key==="estimate_followup"?"ESTIMATE":"INVOICE";
    const cutoff=new Date(Date.now()-Number(rule.delay_hours||0)*3600000).toISOString();
    const {data:docs,error:derr}=await db.from("documents")
      .select("id,partner_id,document_type,status,payload,public_token,document_no,total,project_name,created_at")
      .eq("partner_id",rule.partner_id)
      .eq("document_type",type)
      .in("status",["draft","sent","viewed"])
      .lte("created_at",cutoff)
      .limit(100);
    if(derr)throw derr;
    for(const doc of (docs||[])){
      const recipient=clean(doc?.payload?.client?.email,180);
      if(!recipient||!validEmail(recipient))continue;
      const dueAt=new Date(new Date(doc.created_at).getTime()+Number(rule.delay_hours||0)*3600000).toISOString();
      const {error:qerr}=await db.from("automation_queue").upsert({
        partner_id:rule.partner_id,
        document_id:doc.id,
        rule_key:rule.rule_key,
        status:"pending",
        due_at:dueAt,
        recipient,
        metadata:{source:"hourly-discovery"},
        updated_at:new Date().toISOString()
      },{onConflict:"partner_id,document_id,rule_key",ignoreDuplicates:true});
      if(!qerr)queued++;
    }
  }
  return queued;
}

async function processAutomationQueue(db:any){
  const {data:tasks,error}=await db.from("automation_queue")
    .select("*")
    .in("status",["pending","failed"])
    .lte("due_at",new Date().toISOString())
    .lt("attempts",3)
    .order("due_at",{ascending:true})
    .limit(25);
  if(error)throw error;
  let processed=0,sent=0,review=0,failed=0;

  for(const task of (tasks||[])){
    processed++;
    try{
      await db.from("automation_queue").update({status:"processing",attempts:Number(task.attempts||0)+1,updated_at:new Date().toISOString()}).eq("id",task.id);
      const [{data:rule},{data:partner},{data:doc}]=await Promise.all([
        db.from("ai_automation_rules").select("*").eq("partner_id",task.partner_id).eq("rule_key",task.rule_key).maybeSingle(),
        db.from("partners").select("*").eq("id",task.partner_id).maybeSingle(),
        db.from("documents").select("*").eq("id",task.document_id).maybeSingle()
      ]);
      if(!rule?.enabled||!partner||!doc)throw new Error("Automation rule or document is unavailable");
      const pro=await activeProForPartner(db,task.partner_id);
      if(!pro){
        await db.from("automation_queue").update({status:"skipped",last_error:"Pro subscription inactive",updated_at:new Date().toISOString()}).eq("id",task.id);
        continue;
      }
      const purpose=automationPurpose(task.rule_key);
      if(!purpose)throw new Error("Unsupported automation rule");
      const recipient=clean(task.recipient||doc?.accepted_email||doc?.payload?.client?.email,180);
      const draft=await buildAiDraft(db,partner,purpose,doc,rule.tone||"professional","automation_draft");
      if(rule.approval_mode==="review"){
        await db.from("automation_queue").update({
          status:"review",recipient,subject:draft.subject,message:draft.body,last_error:null,updated_at:new Date().toISOString()
        }).eq("id",task.id);
        review++;
      }else{
        await sendAutomationEmail(db,partner,doc,recipient,draft.subject,draft.body,task.rule_key);
        await db.from("automation_queue").update({
          status:"sent",recipient,subject:draft.subject,message:draft.body,last_error:null,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()
        }).eq("id",task.id);
        sent++;
      }
    }catch(e){
      failed++;
      await db.from("automation_queue").update({
        status:"failed",last_error:clean((e as any)?.message||"Automation failed",500),updated_at:new Date().toISOString()
      }).eq("id",task.id);
    }
  }
  return {processed,sent,review,failed};
}

async function runAutomations(req:Request,db:any){
  if(!(await automationSecretOk(req,db)))return json({ok:false,error:"Invalid automation runner secret"},403);
  const startedAt=new Date().toISOString();
  const queued=await discoverDueAutomationTasks(db);
  const result=await processAutomationQueue(db);
  const payload={ok:true,queued,...result};
  await db.from("platform_config").upsert([
    {key:"automation_runner_last_run",value:startedAt,updated_at:new Date().toISOString()},
    {key:"automation_runner_last_result",value:JSON.stringify(payload),updated_at:new Date().toISOString()}
  ],{onConflict:"key"});
  return json(payload);
}

async function sendReviewedAutomation(req:Request,db:any,body:any){
  const ap=await authenticatedPartner(req,db);
  if(!ap)return json({ok:false,error:"Sign in required"},401);
  const pro=await activeProForPartner(db,ap.partner.id);
  if(!pro)return json({ok:false,error:"Active Pro plan required"},402);
  const taskId=clean(body.task_id,80);
  const {data:task,error}=await db.from("automation_queue").select("*").eq("id",taskId).eq("partner_id",ap.partner.id).maybeSingle();
  if(error)throw error;
  if(!task||task.status!=="review")return json({ok:false,error:"Review task not found"},404);
  const {data:doc,error:derr}=await db.from("documents").select("*").eq("id",task.document_id).maybeSingle();
  if(derr)throw derr;
  if(!doc)return json({ok:false,error:"Document not found"},404);
  const subject=clean(body.subject||task.subject,120);
  const message=clean(body.message||task.message,1600);
  const recipient=clean(task.recipient||doc?.payload?.client?.email,180);
  await sendAutomationEmail(db,ap.partner,doc,recipient,subject,message,task.rule_key);
  await db.from("automation_queue").update({
    status:"sent",subject,message,sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()
  }).eq("id",task.id);
  return json({ok:true});
}

async function requirePlatformAdmin(req: Request, db: any) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data:u, error } = await db.auth.getUser(token);
  if (error || !u?.user?.id) return null;
  const { data:adminRow } = await db.from("platform_admins")
    .select("user_id,role,active")
    .eq("user_id",u.user.id)
    .eq("active",true)
    .maybeSingle();
  return adminRow || null;
}

async function adminSummary(req: Request, db: any) {
  const adminRow = await requirePlatformAdmin(req,db);
  if (!adminRow) return json({ok:false,error:"Admin access required"},403);

  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const monthIso = monthStart.toISOString();

  const [partnersR, entR, eventsR, costsR, docsR, leadsR, aiR, rulesR, queueR, configR] = await Promise.all([
    db.from("partners").select("id,company_name,email,plan,created_at,updated_at,stripe_customer_id,stripe_subscription_id"),
    db.from("pro_entitlements").select("id,partner_id,email,status,monthly_amount,currency,stripe_customer_id,stripe_subscription_id,current_period_end,created_at,updated_at"),
    db.from("billing_events").select("id,event_type,partner_id,stripe_customer_id,stripe_subscription_id,amount,currency,status,occurred_at").order("occurred_at",{ascending:false}).limit(1000),
    db.from("platform_costs").select("*").order("cost_date",{ascending:false}).limit(500),
    db.from("documents").select("id,document_type,status,total,created_at,partner_id").not("partner_id","is",null),
    db.from("material_leads").select("id,status,created_at"),
    db.from("ai_activity").select("id,partner_id,event_type,rule_key,model,status,input_tokens,output_tokens,estimated_cost,created_at").order("created_at",{ascending:false}).limit(500),
    db.from("ai_automation_rules").select("id,partner_id,rule_key,enabled,trigger_event,delay_hours,channel,approval_mode,tone,updated_at").order("updated_at",{ascending:false}).limit(500),
    db.from("automation_queue").select("id,partner_id,document_id,rule_key,status,due_at,recipient,subject,attempts,last_error,sent_at,created_at,updated_at").order("created_at",{ascending:false}).limit(500),
    db.from("platform_config").select("key,value").in("key",["automation_runner_last_run","automation_runner_last_result"])
  ]);

  const partners = partnersR.data || [];
  const ent = entR.data || [];
  const events = eventsR.data || [];
  const costs = costsR.data || [];
  const activeCosts = costs.filter((x:any)=>x.active !== false);
  const docs = docsR.data || [];
  const leads = leadsR.data || [];
  const ai = aiR.data || [];
  const rules = rulesR.data || [];
  const queue = queueR.data || [];
  const config = Object.fromEntries((configR.data || []).map((x:any)=>[x.key,x.value]));

  const activeSubs = ent.filter((x:any)=>x.status==="active");
  const mrr = activeSubs.reduce((s:number,x:any)=>s+Number(x.monthly_amount||0),0);
  const paidEvents = events.filter((x:any)=>x.event_type==="invoice.paid");
  const realizedRevenue = paidEvents.reduce((s:number,x:any)=>s+Number(x.amount||0),0);
  const revenueThisMonth = paidEvents
    .filter((x:any)=>String(x.occurred_at||"")>=monthIso)
    .reduce((s:number,x:any)=>s+Number(x.amount||0),0);

  const monthlyCosts = activeCosts.reduce((s:number,x:any)=>{
    const amt=Number(x.amount||0);
    if(x.cadence==="monthly") return s+amt;
    if(x.cadence==="annual") return s+amt/12;
    if(x.cadence==="one_time" && String(x.cost_date||"")>=monthIso.slice(0,10)) return s+amt;
    return s;
  },0);

  const aiCostMonth = ai
    .filter((x:any)=>String(x.created_at||"")>=monthIso)
    .reduce((s:number,x:any)=>s+Number(x.estimated_cost||0),0);

  const automationMetrics = {
    enabled_rules: rules.filter((x:any)=>x.enabled).length,
    pending: queue.filter((x:any)=>x.status==="pending" || x.status==="processing").length,
    review: queue.filter((x:any)=>x.status==="review").length,
    sent: queue.filter((x:any)=>x.status==="sent").length,
    failed: queue.filter((x:any)=>x.status==="failed").length
  };

  return json({
    ok:true,
    role:adminRow.role,
    mode:"sandbox",
    metrics:{
      accounts:partners.length,
      free_accounts:partners.filter((x:any)=>x.plan==="free").length,
      pro_accounts:activeSubs.length,
      mrr,
      arr:mrr*12,
      realized_revenue:realizedRevenue,
      revenue_this_month:revenueThisMonth,
      monthly_costs:monthlyCosts,
      ai_cost_month:aiCostMonth,
      projected_operating_margin:mrr-monthlyCosts-aiCostMonth,
      realized_net_this_month:revenueThisMonth-monthlyCosts-aiCostMonth,
      estimates:docs.filter((x:any)=>x.document_type==="ESTIMATE").length,
      invoices:docs.filter((x:any)=>x.document_type==="INVOICE").length,
      accepted_estimates:docs.filter((x:any)=>x.status==="accepted").length,
      material_leads:leads.length,
      past_due:ent.filter((x:any)=>["past_due","unpaid"].includes(x.status)).length,
      ai_actions_month:ai.filter((x:any)=>String(x.created_at||"")>=monthIso).length,
      ...automationMetrics
    },
    health:{
      stripe_webhook:Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")),
      resend:Boolean(Deno.env.get("RESEND_API_KEY")),
      openai:Boolean(Deno.env.get("OPENAI_API_KEY")),
      openai_model:Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
      automation_scheduler:true,
      automation_last_run:config.automation_runner_last_run || null,
      automation_last_result:config.automation_runner_last_result || null
    },
    subscriptions:ent,
    partners,
    billing_events:events.slice(0,100),
    costs,
    ai_activity:ai.slice(0,100),
    automation_rules:rules,
    automation_queue:queue.slice(0,100)
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const db = admin();

  try {

    if (action === "auth-signup" && req.method === "POST") {
      const b = await req.json();
      if (b.website) return json({ok:true});
      const company = clean(b.company,160);
      const email = clean(b.email,180).toLowerCase();
      const password = String(b.password ?? "").slice(0,200);
      if (!company || !email || !validEmail(email) || password.length < 6) {
        return json({ok:false,error:"Company, valid email and password with at least 6 characters are required"},400);
      }
      const { data, error } = await db.auth.admin.generateLink({
        type:"signup",
        email,
        password,
        options:{
          data:{company_name:company,referred_by_code:clean(b.referral_code,40).toUpperCase()||null},
          redirectTo:"https://pristineflooring.online/calculator.html"
        }
      });
      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("already") || msg.includes("registered")) {
          return json({ok:false,error:"An account with this email already exists. Sign in or reset your password.",code:"account_exists"},409);
        }
        throw error;
      }
      const link = data?.properties?.action_link;
      if (!link) throw new Error("Could not create confirmation link");
      const sent = await sendAuthEmail(db,{
        to:email,
        subject:"Confirm your Pristine Estimator account",
        headline:"Confirm your company workspace",
        copy:"Confirm your email to activate your free Pristine Flooring Estimator workspace.",
        actionLabel:"Confirm email & open workspace",
        actionLink:link,
        templateKey:"auth-confirmation"
      });
      if (sent?.rateLimited) return json({ok:false,error:"Please wait a few minutes before requesting another confirmation email."},429);
      return json({ok:true,email_sent:true});
    }

    if (action === "auth-recovery" && req.method === "POST") {
      const b = await req.json();
      const email = clean(b.email,180).toLowerCase();
      if (!email || !validEmail(email)) return json({ok:false,error:"Valid email required"},400);
      const result = await generateAndSendAuthLink(db,"recovery",email);
      if (result?.rateLimited) return json({ok:false,error:"Please wait a few minutes before requesting another email."},429);
      return json({ok:true});
    }

    if (action === "auth-access-link" && req.method === "POST") {
      const b = await req.json();
      const email = clean(b.email,180).toLowerCase();
      if (!email || !validEmail(email)) return json({ok:false,error:"Valid email required"},400);
      const result = await generateAndSendAuthLink(db,"magiclink",email);
      if (result?.rateLimited) return json({ok:false,error:"Please wait a few minutes before requesting another email."},429);
      return json({ok:true});
    }

    if (action === "geocode-project" && req.method === "POST") {
      const ap = await authenticatedPartner(req,db);
      if (!ap) return json({ok:false,error:"Sign in required"},401);
      const b = await req.json();

      let censusUrl = "";
      const lat = Number(b.lat), lng = Number(b.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180) {
        censusUrl = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x="+encodeURIComponent(String(lng))+"&y="+encodeURIComponent(String(lat))+"&benchmark=Public_AR_Current&vintage=Current_Current&format=json";
      } else {
        const street=clean(b.street,180), city=clean(b.city,100), state=clean(b.state,40), zip=clean(b.zip,20);
        const one=[street,city,state,zip].filter(Boolean).join(", ");
        if (!one) return json({ok:false,error:"Address required"},400);
        censusUrl = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address="+encodeURIComponent(one)+"&benchmark=Public_AR_Current&vintage=Current_Current&format=json";
      }

      const gres = await fetch(censusUrl,{headers:{"User-Agent":"Pristine Flooring Estimator"}});
      if (!gres.ok) return json({ok:false,error:"Address lookup unavailable"},502);
      const gd:any = await gres.json();

      let street=null, city=null, state=null, zip=null, outLat=null, outLng=null, county=null;
      if (gd?.result?.addressMatches?.length) {
        const m=gd.result.addressMatches[0];
        const c=m.addressComponents||{};
        street=clean([c.fromAddress,c.preQualifier,c.preDirection,c.preType,c.streetName,c.suffixType,c.suffixDirection,c.suffixQualifier].filter(Boolean).join(" "),180)||clean(m.matchedAddress,220)||null;
        city=clean(c.city,100)||null;
        state=clean(c.state,40)||null;
        zip=clean(c.zip,20)||null;
        outLat=Number(m.coordinates?.y)||null;
        outLng=Number(m.coordinates?.x)||null;
        const counties=m.geographies?.Counties||m.geographies?.["Counties"]||[];
        county=clean(counties?.[0]?.NAME||counties?.[0]?.BASENAME||"",120)||null;
      } else if (gd?.result?.geographies) {
        const g=gd.result.geographies;
        const counties=g.Counties||[];
        county=clean(counties?.[0]?.NAME||counties?.[0]?.BASENAME||"",120)||null;
        const zips=g["2020 Census ZIP Code Tabulation Areas"]||g["ZIP Code Tabulation Areas"]||[];
        zip=clean(zips?.[0]?.ZCTA5||zips?.[0]?.GEOID||"",20)||null;
        outLat=lat; outLng=lng;
      }

      if (!outLat || !outLng) return json({ok:false,error:"Address could not be validated"},404);

      let distributor:any=null;
      const routedDistributorId=await routeDistributor(db,{state:state||"",county:county||"",zip:zip||""});
      if(routedDistributorId){
        const {data:d}=await db.from("distributors").select("id,name").eq("id",routedDistributorId).maybeSingle();
        if(d){
          const {data:t}=await db.from("distributor_territories")
            .select("territory_name")
            .eq("distributor_id",routedDistributorId)
            .eq("active",true)
            .order("priority",{ascending:true})
            .limit(1)
            .maybeSingle();
          distributor={id:d.id,name:d.name,territory:t?.territory_name||null};
        }
      }

      return json({ok:true,address:{street,city,state,zip,lat:outLat,lng:outLng,county},distributor});
    }

    if (action === "ensure-partner-network" && req.method === "POST") {
      const ap = await authenticatedPartner(req,db);
      if (!ap) return json({ok:false,error:"Sign in required"},401);

      let {data:profile} = await db.from("partner_profiles")
        .select("*")
        .eq("partner_id",ap.partner.id)
        .maybeSingle();

      if (!profile) {
        const {data:p,error:perr}=await db.from("partner_profiles")
          .insert({partner_id:ap.partner.id})
          .select("*")
          .single();
        if (perr) throw perr;
        profile=p;
      }

      let {data:refCode} = await db.from("referral_codes")
        .select("id,code,partner_id,active")
        .eq("partner_id",ap.partner.id)
        .eq("active",true)
        .maybeSingle();

      if (!refCode) {
        let created:any=null;
        for (let i=0;i<5 && !created;i++) {
          const candidate="PF-"+crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase();
          const {data,error}=await db.from("referral_codes")
            .insert({partner_id:ap.partner.id,code:candidate})
            .select("id,code,partner_id,active")
            .single();
          if (!error) created=data;
        }
        if (!created) throw new Error("Could not create Partner ID");
        refCode=created;
      }

      const referredByCode=clean(ap.user?.user_metadata?.referred_by_code,40).toUpperCase();
      if (referredByCode && !profile?.referred_by_partner_id) {
        const {data:parent}=await db.from("referral_codes")
          .select("id,partner_id,code")
          .eq("code",referredByCode)
          .eq("active",true)
          .maybeSingle();

        if (parent && parent.partner_id!==ap.partner.id) {
          const {data:updated,error:uerr}=await db.from("partner_profiles")
            .update({
              referred_by_partner_id:parent.partner_id,
              referred_by_code:parent.code,
              updated_at:new Date().toISOString()
            })
            .eq("partner_id",ap.partner.id)
            .select("*")
            .single();
          if (uerr) throw uerr;
          profile=updated;

          const {count}=await db.from("referral_events")
            .select("id",{count:"exact",head:true})
            .eq("partner_id",parent.partner_id)
            .eq("event_type","partner_signup")
            .contains("metadata",{referred_partner_id:ap.partner.id});
          if ((count||0)===0) {
            await db.from("referral_events").insert({
              partner_id:parent.partner_id,
              referral_code_id:parent.id,
              event_type:"partner_signup",
              metadata:{
                referred_partner_id:ap.partner.id,
                referred_email:ap.user?.email||null
              }
            });
          }
        }
      }

      return json({ok:true,profile,referral_code:refCode});
    }

    if (action === "referral-open" && req.method === "POST") {
      const b = await req.json();
      const code = clean(b.code,40).toUpperCase();
      if (!code) return json({ok:true});
      const {data:refCode} = await db.from("referral_codes")
        .select("id,partner_id,active")
        .eq("code",code)
        .eq("active",true)
        .maybeSingle();
      if (!refCode) return json({ok:true});
      await db.from("referral_events").insert({
        partner_id:refCode.partner_id,
        referral_code_id:refCode.id,
        event_type:"referral_link_opened",
        metadata:{landing:true}
      });
      return json({ok:true});
    }

    if (action === "partner-profile-completed" && req.method === "POST") {
      const ap = await authenticatedPartner(req,db);
      if (!ap) return json({ok:false,error:"Sign in required"},401);
      const {data:refCode} = await db.from("referral_codes")
        .select("id")
        .eq("partner_id",ap.partner.id)
        .eq("active",true)
        .maybeSingle();
      const {count} = await db.from("referral_events")
        .select("id",{count:"exact",head:true})
        .eq("partner_id",ap.partner.id)
        .eq("event_type","profile_completed");
      if ((count||0)===0) {
        await db.from("referral_events").insert({
          partner_id:ap.partner.id,
          referral_code_id:refCode?.id||null,
          event_type:"profile_completed",
          metadata:{source:"partner_profile"}
        });
      }
      return json({ok:true});
    }


    if (action === "network-role" && req.method === "GET") {
      return await networkRole(req,db);
    }

    if (action === "distributor-dashboard" && req.method === "GET") {
      return await distributorDashboard(req,db,url);
    }


    if (action === "installer-quote-decision" && req.method === "POST") {
      return await installerQuoteDecision(req,db,await req.json());
    }

    if (action === "distributor-update-opportunity" && req.method === "POST") {
      return await distributorUpdateOpportunity(req,db,await req.json());
    }

    if (action === "distributor-submit-quote" && req.method === "POST") {
      return await distributorSubmitQuote(req,db,await req.json());
    }

    if (action === "distributor-request-supply" && req.method === "POST") {
      return await distributorRequestSupply(req,db,await req.json());
    }

    if (action === "distributor-update-order" && req.method === "POST") {
      return await distributorUpdateOrder(req,db,await req.json());
    }

    if (action === "distributor-update-offer" && req.method === "POST") {
      return await distributorUpdateOffer(req,db,await req.json());
    }

    if (action === "admin-network-summary" && req.method === "GET") {
      return await adminNetworkSummary(req,db);
    }

    if (action === "admin-supply-response" && req.method === "POST") {
      return await adminSupplyResponse(req,db,await req.json());
    }

    if (action === "admin-add-distributor-member" && req.method === "POST") {
      return await adminAddDistributorMember(req,db,await req.json());
    }

    if (action === "admin-summary" && req.method === "GET") {
      return await adminSummary(req,db);
    }

    if (action === "ai-compose" && req.method === "POST") {
      return await generateAiCustomerMessage(req,db,await req.json());
    }

    if (action === "automation-run" && req.method === "POST") {
      return await runAutomations(req,db);
    }

    if (action === "send-automation-task" && req.method === "POST") {
      return await sendReviewedAutomation(req,db,await req.json());
    }

    if (action === "stripe-webhook" && req.method === "POST") {
      const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      if (!secret) return json({ok:false,error:"Stripe webhook secret is not configured"},503);
      const raw = await req.text();
      const signature = req.headers.get("stripe-signature") || "";
      if (!(await verifyStripeSignature(raw, signature, secret))) return json({ok:false,error:"Invalid Stripe signature"},400);
      const event = JSON.parse(raw);
      const obj = event?.data?.object || {};
      const customerIdForEvent = clean(obj.customer,120) || null;
      const subscriptionIdForEvent = clean(obj.subscription || (obj.object==="subscription"?obj.id:null),120) || null;
      const emailForEvent = clean(obj.customer_details?.email || obj.customer_email || obj.email,180) || null;
      let partnerIdForEvent = null;
      if (customerIdForEvent) {
        const {data:p} = await db.from("partners").select("id").eq("stripe_customer_id",customerIdForEvent).maybeSingle();
        partnerIdForEvent = p?.id || null;
      }
      if (!partnerIdForEvent && emailForEvent) {
        const {data:p} = await db.from("partners").select("id").eq("email",emailForEvent).maybeSingle();
        partnerIdForEvent = p?.id || null;
      }
      let amountForEvent = 0;
      if (typeof obj.amount_paid==="number") amountForEvent = obj.amount_paid/100;
      else if (typeof obj.amount_total==="number") amountForEvent = obj.amount_total/100;
      else if (typeof obj.amount_due==="number") amountForEvent = obj.amount_due/100;
      await db.from("billing_events").upsert({
        stripe_event_id:clean(event.id,140),
        event_type:clean(event.type,120),
        partner_id:partnerIdForEvent,
        stripe_customer_id:customerIdForEvent,
        stripe_subscription_id:subscriptionIdForEvent,
        amount:Math.max(0,amountForEvent),
        currency:clean(obj.currency,12).toUpperCase() || "USD",
        status:clean(obj.status,60) || null,
        occurred_at:event.created ? new Date(Number(event.created)*1000).toISOString() : new Date().toISOString(),
        metadata:{livemode:Boolean(event.livemode),object:clean(obj.object,60)}
      },{onConflict:"stripe_event_id"});

      if (event.type === "checkout.session.completed") {
        const sessionId = clean(obj.id,120);
        const subscriptionId = clean(obj.subscription,120) || null;
        const customerId = clean(obj.customer,120) || null;
        const email = clean(obj.customer_details?.email || obj.customer_email,180) || null;
        if (sessionId) {
          const { error } = await db.from("pro_entitlements").upsert({
            checkout_session_id:sessionId,
            stripe_customer_id:customerId,
            stripe_subscription_id:subscriptionId,
            email,
            status:"active",
            updated_at:new Date().toISOString()
          },{onConflict:"checkout_session_id"});
          if (error) throw error;
        }
      }

      if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
        const subscriptionId = clean(obj.id,120);
        const status = event.type === "customer.subscription.deleted" ? "canceled" : mapSubscriptionStatus(clean(obj.status,40));
        if (subscriptionId) {
          const { error } = await db.from("pro_entitlements")
            .update({
              status,
              stripe_customer_id:clean(obj.customer,120)||null,
              current_period_end:obj.current_period_end ? new Date(Number(obj.current_period_end)*1000).toISOString() : null,
              updated_at:new Date().toISOString()
            })
            .eq("stripe_subscription_id",subscriptionId);
          if (error) throw error;
          const nextPlan = status === "active" ? "pro" : "free";
          await db.from("partners")
            .update({plan:nextPlan,updated_at:new Date().toISOString()})
            .eq("stripe_subscription_id",subscriptionId);
        }
      }
      return json({received:true});
    }

    if (action === "activate-pro" && req.method === "POST") {
      const b = await req.json();
      const sessionId = clean(b.session_id,120);
      if (!sessionId) return json({ok:false,error:"Checkout session required"},400);
      const { data:ent, error } = await db.from("pro_entitlements")
        .select("*")
        .eq("checkout_session_id",sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!ent) return json({ok:false,error:"Payment is still being confirmed"},409);
      if (ent.status !== "active") return json({ok:false,error:"Pro subscription is not active"},402);
      const token = "pro_" + crypto.randomUUID() + crypto.randomUUID().replaceAll("-","");
      const tokenHash = await sha256(token);
      const ap = await authenticatedPartner(req,db);
      const update:any = {access_token_hash:tokenHash,activated_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      if (ap?.partner?.id) update.partner_id = ap.partner.id;
      const { error:uerr } = await db.from("pro_entitlements").update(update).eq("id",ent.id);
      if (uerr) throw uerr;
      if (ap?.partner?.id) {
        await db.from("partners").update({
          plan:"pro",
          stripe_customer_id:ent.stripe_customer_id || ap.partner.stripe_customer_id || null,
          stripe_subscription_id:ent.stripe_subscription_id || ap.partner.stripe_subscription_id || null,
          updated_at:new Date().toISOString()
        }).eq("id",ap.partner.id);
      }
      return json({ok:true,pro_token:token,status:"active",email:ent.email||null,account_linked:Boolean(ap?.partner?.id)});
    }

    if (action === "pro-status" && req.method === "POST") {
      const b = await req.json();
      const ap = await authenticatedPartner(req,db);
      let ent = ap ? await activeProForPartner(db,ap.partner.id) : null;
      if (!ent) ent = await activePro(db,b.pro_token);
      return json({ok:true,active:Boolean(ent),status:ent?.status||"inactive",account_linked:Boolean(ent?.partner_id)});
    }

    if (action === "billing-health" && req.method === "GET") {
      const {data:cfg}=await db.from("platform_config").select("key,value").in("key",["automation_runner_last_run","automation_runner_last_result"]);
      const c=Object.fromEntries((cfg||[]).map((x:any)=>[x.key,x.value]));
      return json({
        ok:true,
        stripeWebhookConfigured:Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")),
        resendConfigured:Boolean(Deno.env.get("RESEND_API_KEY")),
        openaiConfigured:Boolean(Deno.env.get("OPENAI_API_KEY")),
        openaiModel:Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
        automationScheduler:true,
        automationLastRun:c.automation_runner_last_run||null,
        automationLastResult:c.automation_runner_last_result||null
      });
    }

    if (action === "email-health" && req.method === "GET") {
      return json({
        ok:true,
        resendConfigured:Boolean(Deno.env.get("RESEND_API_KEY")),
        sender:"estimates@mail.pristineflooring.online"
      });
    }

    if (action === "material-lead" && req.method === "POST") {
      const b = await req.json();
      if (b.website) return json({ ok: true });

      const ap = await authenticatedPartner(req,db);
      if (!ap) return json({ok:false,error:"Sign in required"},401);

      const material = clean(b.material,120);
      const opportunityType = clean(b.opportunity_type,40) || "quote_for_me";
      const buyerRole = clean(b.buyer_role,40) || "unknown";
      const required = Number(b.required_sqft || 0);
      const measured = Math.max(0,Number(b.measured_sqft || 0));
      const estimateTotal = Math.max(0,Number(b.estimate_total || 0));
      const estimateNo = clean(b.estimate_no,80) || null;
      const productSizes = Array.isArray(b.product_sizes)
        ? [...new Set(b.product_sizes.map((v:any)=>clean(v,40)).filter(Boolean))].slice(0,12)
        : [];
      const customSize = clean(b.custom_size,80) || null;
      const catalogVariantIdRaw = clean(b.catalog_variant_id,80);
      const catalogVariantId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(catalogVariantIdRaw) ? catalogVariantIdRaw : null;
      const productSku = clean(b.product_sku,80) || null;
      const productName = clean(b.product_name,180) || null;
      const unitPriceSqft = Math.max(0,Number(b.unit_price_sqft || 0));
      const calculatedBoxes = Math.max(0,Math.round(Number(b.calculated_boxes || 0)));
      const projectState = clean(b.state,40).toUpperCase();
      const projectCounty = clean(b.county,100);
      const projectZip = clean(b.zip,20);
      const assignedDistributorId = await routeDistributor(db,{
        catalogVariantId,
        state:projectState,
        county:projectCounty,
        zip:projectZip,
        fallbackId:clean(b.assigned_distributor_id,80)||null
      });

      if (!material || required <= 0 || required > 1000000) {
        return json({ok:false,error:"Invalid material opportunity data"},400);
      }

      const {data:refCode} = await db.from("referral_codes")
        .select("id,code")
        .eq("partner_id",ap.partner.id)
        .eq("active",true)
        .maybeSingle();

      if (opportunityType === "already_purchased") {
        await db.from("referral_events").insert({
          partner_id:ap.partner.id,
          referral_code_id:refCode?.id||null,
          event_type:"material_already_purchased",
          metadata:{
            material,
            product_sizes:productSizes,
            custom_size:customSize,
            catalog_variant_id:catalogVariantId,
            product_sku:productSku,
            product_name:productName,
            unit_price_sqft:unitPriceSqft,
            calculated_boxes:calculatedBoxes,
            measured_sqft:measured,
            required_sqft:required,
            estimate_no:estimateNo,
            estimate_total:estimateTotal,
            buyer_role:buyerRole,
            project_name:clean(b.project,180)||null
          }
        });
        return json({ok:true,recorded:true,lead:null});
      }

      if (!b.consent) return json({ok:false,error:"Consent is required before sharing project details"},400);

      const email = clean(b.email,180).toLowerCase();
      const phone = clean(b.phone,60);
      if (!email && !phone) return json({ok:false,error:"Email or phone is required"},400);
      if (email && !validEmail(email)) return json({ok:false,error:"Invalid email"},400);

      let documentId = null;
      if (estimateNo) {
        const {data:doc} = await db.from("documents")
          .select("id")
          .eq("partner_id",ap.partner.id)
          .eq("document_no",estimateNo)
          .order("updated_at",{ascending:false})
          .limit(1)
          .maybeSingle();
        documentId = doc?.id || null;
      }

      const row = {
        partner_id:ap.partner.id,
        document_id:documentId,
        referral_code_id:refCode?.id||null,
        opportunity_type:opportunityType,
        buyer_role:buyerRole,
        requester_company:clean(b.company,160)||null,
        requester_name:clean(b.name,160)||null,
        phone:phone||null,
        email:email||null,
        project_name:clean(b.project,180)||null,
        project_address:clean(b.address,280)||null,
        project_city:clean(b.city,100)||null,
        project_state:projectState||null,
        project_county:projectCounty||null,
        project_zip:projectZip||null,
        project_lat:Number.isFinite(Number(b.lat))?Number(b.lat):null,
        project_lng:Number.isFinite(Number(b.lng))?Number(b.lng):null,
        assigned_distributor_id:assignedDistributorId,
        material,
        product_sizes:productSizes,
        custom_size:customSize,
        catalog_variant_id:catalogVariantId,
        product_sku:productSku,
        product_name:productName,
        unit_price_sqft:unitPriceSqft,
        calculated_boxes:calculatedBoxes,
        measured_sqft:measured,
        waste_pct:Math.min(50,Math.max(0,Number(b.waste_pct||0))),
        required_sqft:required,
        estimate_no:estimateNo,
        estimate_total:estimateTotal,
        notes:clean(b.notes,1200)||null,
        consent_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      };

      const {data,error}=await db.from("material_leads").insert(row).select("id,status,created_at,opportunity_type,assigned_distributor_id").single();
      if(error)throw error;

      await db.from("opportunity_events").insert([
        {
          material_lead_id:data.id,
          actor_type:"installer",
          actor_user_id:ap.user.id,
          event_type:"quote_requested",
          message:"Installer requested material pricing through Pristine.",
          metadata:{required_sqft:required,product_sku:productSku,product_name:productName,estimate_no:estimateNo}
        },
        ...(assignedDistributorId ? [{
          material_lead_id:data.id,
          actor_type:"system",
          actor_user_id:null,
          event_type:"distributor_assigned",
          message:"Pristine routed the opportunity to the assigned distributor.",
          metadata:{distributor_id:assignedDistributorId,project_state:projectState,project_county:projectCounty,project_zip:projectZip}
        }] : [])
      ]);

      await db.from("referral_events").insert([
        {
          partner_id:ap.partner.id,
          referral_code_id:refCode?.id||null,
          material_lead_id:data.id,
          event_type:"material_opportunity",
          metadata:{opportunity_type:opportunityType,material,product_sizes:productSizes,custom_size:customSize,product_sku:productSku,product_name:productName,unit_price_sqft:unitPriceSqft,calculated_boxes:calculatedBoxes,required_sqft:required,estimate_no:estimateNo}
        },
        {
          partner_id:ap.partner.id,
          referral_code_id:refCode?.id||null,
          material_lead_id:data.id,
          event_type:opportunityType==="send_to_customer"?"customer_referred":"quote_requested",
          metadata:{material,product_sizes:productSizes,custom_size:customSize,product_sku:productSku,product_name:productName,unit_price_sqft:unitPriceSqft,calculated_boxes:calculatedBoxes,required_sqft:required,estimate_no:estimateNo}
        }
      ]);

      return json({ok:true,lead:data,partner_code:refCode?.code||null});
    }

    if (action === "document" && req.method === "POST") {
      const b = await req.json();
      const ap = await authenticatedPartner(req,db);
      let pro = ap ? await activeProForPartner(db,ap.partner.id) : null;
      if (!pro) pro = await activePro(db,b.pro_token);
      if (!pro) return json({ok:false,error:"Active Pro plan required"},402);
      const partnerId = ap?.partner?.id || pro.partner_id || null;
      const type = b.document_type === "INVOICE" ? "INVOICE" : "ESTIMATE";
      const total = Math.max(0, Number(b.total || 0));
      const documentNo = clean(b.document_no,80);
      const clientDocumentId = clean(b.client_document_id,120);
      if (!documentNo) return json({ok:false,error:"Document number required"},400);
      const payload = b.payload && typeof b.payload === "object" ? b.payload : {};
      const manageToken = crypto.randomUUID()+"-"+crypto.randomUUID();
      const manageTokenHash = await sha256(manageToken);

      let existing:any = null;
      if (partnerId && clientDocumentId) {
        const { data:e, error:eerr } = await db.from("documents")
          .select("id,public_token,status")
          .eq("partner_id",partnerId)
          .eq("client_document_id",clientDocumentId)
          .maybeSingle();
        if (eerr) throw eerr;
        existing = e || null;
      }

      let data:any = null;
      if (existing) {
        const { data:updated, error } = await db.from("documents").update({
          document_no:documentNo,
          document_type:type,
          project_name:clean(b.project_name,180)||null,
          project_address:clean(b.project_address,280)||null,
          payload,
          total,
          manage_token_hash:manageTokenHash,
          updated_at:new Date().toISOString()
        }).eq("id",existing.id).select("id,public_token,status").single();
        if (error) throw error;
        data = updated;
      } else {
        const { data:inserted, error } = await db.from("documents").insert({
          partner_id:partnerId,
          client_document_id:clientDocumentId||null,
          document_no:documentNo,
          document_type:type,
          status:"draft",
          project_name:clean(b.project_name,180)||null,
          project_address:clean(b.project_address,280)||null,
          payload,
          total,
          manage_token_hash:manageTokenHash
        }).select("id,public_token,status").single();
        if (error) throw error;
        data = inserted;
      }

      return json({
        ok:true,
        document:data,
        manage_token:manageToken,
        public_url:`https://pristineflooring.online/client-document.html?token=${data.public_token}`
      });
    }

    if (action === "send-document-email" && req.method === "POST") {
      return await sendDocumentEmail(req, db, await req.json());
    }

    if (action === "public-document" && req.method === "GET") {
      const token = clean(url.searchParams.get("token"), 60);
      const { data, error } = await db.from("documents").select("id,document_no,document_type,status,project_name,project_address,payload,total,public_token,viewed_at,accepted_at,accepted_name,accepted_email,created_at").eq("public_token", token).maybeSingle();
      if (error) throw error;
      if (!data) return json({ok:false,error:"Not found"},404);
      if (!data.viewed_at) await db.from("documents").update({ viewed_at:new Date().toISOString(), status:data.status==="draft"?"viewed":data.status }).eq("id",data.id);
      return json({ok:true,document:data});
    }

    if (action === "accept-document" && req.method === "POST") {
      const b = await req.json();
      const token = clean(b.token,60), name = clean(b.name,160), email = clean(b.email,180);
      if (!token || !name || !email || !validEmail(email)) return json({ok:false,error:"Name and valid email required"},400);
      const { data:doc, error:e1 } = await db.from("documents").select("id,partner_id,document_type,status,payload,public_token,created_at").eq("public_token",token).maybeSingle();
      if (e1) throw e1;
      if (!doc) return json({ok:false,error:"Not found"},404);
      if (doc.document_type !== "ESTIMATE") return json({ok:false,error:"Only estimates can be accepted"},400);
      const { error:e2 } = await db.from("documents").update({
        status:"accepted",
        accepted_at:new Date().toISOString(),
        accepted_name:name,
        accepted_email:email
      }).eq("id",doc.id);
      if (e2) throw e2;
      if (doc.partner_id) {
        const {data:rule}=await db.from("ai_automation_rules")
          .select("*")
          .eq("partner_id",doc.partner_id)
          .eq("rule_key","acceptance_confirmation")
          .eq("enabled",true)
          .maybeSingle();
        if (rule) {
          await db.from("automation_queue").upsert({
            partner_id:doc.partner_id,
            document_id:doc.id,
            rule_key:"acceptance_confirmation",
            status:"pending",
            due_at:new Date().toISOString(),
            recipient:email,
            metadata:{accepted_name:name},
            updated_at:new Date().toISOString()
          },{onConflict:"partner_id,document_id,rule_key"});
        }
      }
      return json({ok:true,status:"accepted"});
    }

    if (action === "pro-interest" && req.method === "POST") {
      const b = await req.json();
      if (b.website) return json({ok:true});
      const email=clean(b.email,180);
      if (!validEmail(email)) return json({ok:false,error:"Invalid email"},400);
      const { error } = await db.from("pro_interest").insert({
        email:email||null,
        phone:clean(b.phone,60)||null,
        company:clean(b.company,160)||null,
        feature:clean(b.feature,80)||null
      });
      if (error) throw error;
      return json({ok:true});
    }

    return json({ ok:false, error:"Unknown action" },404);
  } catch (e) {
    console.error(e);
    return json({ ok:false, error:"Server error" },500);
  }
});