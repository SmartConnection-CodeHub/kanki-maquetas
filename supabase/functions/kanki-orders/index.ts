// KANKI — Edge Function kanki-orders (v3 · Mercado Pago Checkout Pro · 2026-07-21)
// Acciones: create (orden simulada + 2 emails) · track · admin-list · admin-update
//           mp-preference (orden pending_payment + preferencia Checkout Pro → initPoint)
//           mp-webhook (notificación MP → confirma orden + emails)
// Escrituras con service_role (RLS intacto). Email vía Gmail API con service account
// smc-mailer (delegación de dominio, remitente MAIL_SENDER).
// v2: Authorization Bearer válido → orden/customer vinculados al user_id (invitado intacto).
// v3: única pasarela = Mercado Pago. Sin MP_ACCESS_TOKEN configurado, mp-preference
//     responde configured:false y el front cae a la simulación (QAS sin credenciales).

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAIL_SENDER = Deno.env.get("MAIL_SENDER") || "guillermo.gonzalez@smconnection.cl";
const ADMIN_NOTIFY = (Deno.env.get("ADMIN_NOTIFY") || "").split(",").map(s => s.trim()).filter(Boolean);
const ADMIN_KEY = Deno.env.get("KANKI_ADMIN_KEY") || "";
const SA_RAW = Deno.env.get("SMC_MAILER_KEY") || "";
const TRACK_URL = "https://kankisurf.cl/pedido/";
// Ambientes MP: QAS (qas.kanki/localhost) usa credenciales TEST · PRD (kankisurf.cl) usa PROD.
const MP_TOKEN_PROD = Deno.env.get("MP_ACCESS_TOKEN") || "";
const MP_TOKEN_TEST = Deno.env.get("MP_ACCESS_TOKEN_TEST") || "";

function mpEnv(req: Request): { token: string; returnUrl: string; env: string } {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const isQas = /qas\.kanki\.smconnection\.cl|localhost|127\.0\.0\.1/.test(origin);
  return isQas
    ? { token: MP_TOKEN_TEST, returnUrl: "https://qas.kanki.smconnection.cl/checkout/", env: "test" }
    : { token: MP_TOKEN_PROD, returnUrl: "https://kankisurf.cl/checkout/", env: "prod" };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ── PostgREST helpers (service_role) ── */
async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`rest ${path}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

/* ── Gmail vía service account (DWD) ── */
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlUtf8 = (s: string) => b64url(unescape(encodeURIComponent(s)));

async function gmailToken(): Promise<string> {
  const sa = JSON.parse(SA_RAW);
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
    b64url(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600, iat: now, sub: MAIL_SENDER,
    }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const jwt = unsigned + "." + btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + jwt,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("gmail token: " + JSON.stringify(data));
  return data.access_token;
}

async function sendMail(token: string, to: string[], subject: string, html: string) {
  const mime = [
    `From: KANKI & CO <${MAIL_SENDER}>`,
    `To: ${to.join(", ")}`,
    `Subject: =?UTF-8?B?${b64urlUtf8(subject).replace(/-/g, "+").replace(/_/g, "/")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    btoa(unescape(encodeURIComponent(html))),
  ].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64urlUtf8(mime) }),
  });
  if (!res.ok) throw new Error("gmail send: " + res.status + " " + (await res.text()).slice(0, 300));
}

/* ── Templates ── */
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CL") + " CLP";
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function emailComprador(o: any): string {
  const rows = o.items.map((i: any) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${esc(i.name)} <span style="color:#6b7280">× ${i.qty}</span></td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${fmt(i.price * i.qty)}</td></tr>`).join("");
  const entrega = o.delivery.mode === "retiro"
    ? "Retiro en tienda — KANKI La Boca, Av. Borgoño s/n, Concón. Te avisaremos por WhatsApp cuando esté listo."
    : `Envío ${o.ship_method === "exp" ? "Express" : "Standard"} a ${esc(o.delivery.address)}, ${esc(o.delivery.city)}, ${esc(o.delivery.region)}.`;
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;color:#0c1b2e">
  <div style="background:linear-gradient(135deg,#0c1b2e,#0d2a47);color:#fff;padding:28px 24px;border-radius:14px 14px 0 0">
    <div style="font-weight:900;font-size:20px;letter-spacing:.12em">KANKI <em style="color:#e8651a">& CO</em></div>
    <div style="color:#22b5a5;font-size:13px;margin-top:4px">¡Pedido confirmado! 🤙</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 14px 14px;padding:24px">
    <p>Hola, recibimos tu pedido <strong style="color:#e8651a">${esc(o.order_number)}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
      <tr><td style="padding:8px 0;color:#6b7280">Envío</td><td style="padding:8px 0;text-align:right">${o.shipping_cost === 0 ? "Gratis" : fmt(o.shipping_cost)}</td></tr>
      <tr><td style="padding:8px 0;font-weight:900;font-size:16px">Total (${o.payment_label})</td><td style="padding:8px 0;text-align:right;font-weight:900;font-size:16px">${fmt(o.total)}</td></tr>
    </table>
    <p style="font-size:13.5px;color:#374151">${entrega}</p>
    <p style="text-align:center;margin:22px 0">
      <a href="${TRACK_URL}?n=${encodeURIComponent(o.order_number)}" style="background:#e8651a;color:#fff;text-decoration:none;font-weight:900;padding:13px 26px;border-radius:10px;display:inline-block">SEGUIR MI PEDIDO</a>
    </p>
    <p style="font-size:12px;color:#6b7280">¿Dudas? WhatsApp +56 9 5780 7766 · KANKI SpA · RUT 78.433.042-7 · Pedido de demostración QAS, sin cargo real.</p>
  </div></div>`;
}

function emailInterno(o: any): string {
  const items = o.items.map((i: any) => `▸ ${esc(i.name)} × ${i.qty} — ${fmt(i.price * i.qty)}`).join("<br>");
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0c1b2e">
  <h2 style="color:#e8651a">🛒 Pedido nuevo ${esc(o.order_number)} — ${fmt(o.total)}</h2>
  <p><strong>Cliente:</strong> ${esc(o.customer_email)} · ${esc(o.customer_phone)}<br>
  <strong>RUT:</strong> ${esc(o.billing_rut)}<br>
  <strong>Entrega:</strong> ${o.delivery.mode === "retiro" ? "Retiro en tienda" : esc(o.delivery.address) + ", " + esc(o.delivery.city) + ", " + esc(o.delivery.region) + " (" + (o.ship_method === "exp" ? "Express" : "Standard") + ")"}<br>
  <strong>Pago:</strong> ${o.payment_label} (simulado QAS)</p>
  <p>${items}</p>
  <p>Subtotal ${fmt(o.subtotal)} · Envío ${o.shipping_cost === 0 ? "Gratis" : fmt(o.shipping_cost)} · <strong>Total ${fmt(o.total)}</strong></p>
  <p style="font-size:12px;color:#6b7280">Gestionar: https://kankisurf.cl/admin.html (vista Pedidos)</p></div>`;
}

/* ── Usuario autenticado (opcional): valida el Bearer contra GoTrue ── */
async function getAuthedUser(req: Request): Promise<{ id: string } | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null; // anon key o token inválido → invitado
    const u = await res.json();
    return u?.id ? u : null;
  } catch { return null; }
}

/* ── Núcleo compartido: crea customer + orden + items (create simulado y mp-preference) ── */
async function insertOrderCore(req: Request, body: any, status: string) {
  const { contact, delivery, shipMethod, payMethod, billing, items, totals } = body;
  if (!contact?.email || !Array.isArray(items) || !items.length || !totals) {
    return { errorResponse: json({ error: "payload incompleto" }, 400) };
  }
  const email = String(contact.email).trim().toLowerCase();
  const user = await getAuthedUser(req);

  // customer: por user_id (sesión) → por email → crear. Con sesión, deja el user_id vinculado.
  let customerId: string | undefined;
  if (user) {
    const byUser = await rest(`customers?user_id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`);
    customerId = byUser?.[0]?.id;
  }
  if (!customerId) {
    const found = await rest(`customers?email=eq.${encodeURIComponent(email)}&select=id,user_id&limit=1`);
    customerId = found?.[0]?.id;
    if (customerId && user && !found[0].user_id) {
      await rest(`customers?id=eq.${customerId}`, { method: "PATCH", body: JSON.stringify({ user_id: user.id }) })
        .catch(() => null); // si el user ya tiene otro customer (unique), la orden sigue
    }
  }
  if (!customerId) {
    const created = await rest("customers", {
      method: "POST",
      body: JSON.stringify({ email, name: email.split("@")[0], phone: contact.phone || null, address: delivery?.address || null, user_id: user?.id ?? null }),
    });
    customerId = created?.[0]?.id;
  }

  // order_number correlativo con reintento ante colisión
  const year = new Date().getFullYear();
  let order: any = null;
  for (let attempt = 0; attempt < 4 && !order; attempt++) {
    const cnt = await rest(`orders?order_number=like.KK-${year}-*&select=order_number&order=order_number.desc&limit=1`);
    const last = cnt?.[0]?.order_number ? parseInt(cnt[0].order_number.split("-")[2], 10) : 0;
    const orderNumber = `KK-${year}-${String(last + 1 + attempt).padStart(4, "0")}`;
    try {
      const rows = await rest("orders", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          user_id: user?.id ?? null,
          order_number: orderNumber,
          status: status,
          customer_name: email.split("@")[0],
          customer_email: email,
          customer_phone: contact.phone || null,
          shipping_address: delivery?.mode === "retiro" ? "RETIRO EN TIENDA" : `${delivery?.address || ""}${delivery?.apt ? ", " + delivery.apt : ""}`,
          shipping_comuna: delivery?.city || null,
          shipping_region: delivery?.region || null,
          ship_method: delivery?.mode === "retiro" ? "retiro" : shipMethod,
          billing_rut: billing?.rut || null,
          items: items,
          subtotal: totals.subtotal,
          shipping_cost: totals.shipping,
          total: totals.total,
          payment_method: payMethod,
          source: "website",
        }),
      });
      order = rows?.[0];
    } catch (e) {
      if (!String(e).includes("23505")) throw e; // solo reintenta colisión de unique
    }
  }
  if (!order) return { errorResponse: json({ error: "no se pudo generar N° de orden" }, 500) };

  // order_items
  const itemRows = items.map((i: any) => {
    const sizeMatch = /\(([^)]+)\)\s*$/.exec(i.name || "");
    return {
      order_id: order.id,
      product_name: i.name,
      size: sizeMatch ? sizeMatch[1] : "única",
      quantity: Number(i.qty) || 1,
      unit_price: Number(i.price) || 0,
    };
  });
  await rest("order_items", { method: "POST", body: JSON.stringify(itemRows) });

  const mailCtx = {
    order_number: order.order_number, items, subtotal: totals.subtotal, shipping_cost: totals.shipping,
    total: totals.total, payment_label: "Mercado Pago", customer_email: email, customer_phone: contact.phone,
    billing_rut: billing?.rut, delivery: delivery || { mode: "retiro" }, ship_method: shipMethod,
  };
  return { order, email, user, mailCtx };
}

/* ── Emails de orden (fallo de correo NO tumba la orden) ── */
async function sendOrderEmails(email: string, mailCtx: any) {
  let emailBuyer = false, emailAdmin = false, emailError = "";
  try {
    const token = await gmailToken();
    try { await sendMail(token, [email], `Pedido confirmado ${mailCtx.order_number} — KANKI & CO`, emailComprador(mailCtx)); emailBuyer = true; } catch (e) { emailError += String(e).slice(0, 200); }
    if (ADMIN_NOTIFY.length) {
      try { await sendMail(token, ADMIN_NOTIFY, `🛒 Pedido nuevo ${mailCtx.order_number} · ${fmt(mailCtx.total)}`, emailInterno(mailCtx)); emailAdmin = true; } catch (e) { emailError += " | " + String(e).slice(0, 200); }
    }
  } catch (e) {
    emailError = String(e).slice(0, 300);
  }
  return { emailBuyer, emailAdmin, emailError };
}

/* ── create: flujo simulado QAS (orden confirmada + emails inmediatos) ── */
async function actionCreate(req: Request, body: any) {
  const core = await insertOrderCore(req, body, "confirmed");
  if (core.errorResponse) return core.errorResponse;
  const { emailBuyer, emailAdmin, emailError } = await sendOrderEmails(core.email, core.mailCtx);
  return json({ ok: true, orderNumber: core.order.order_number, orderId: core.order.id, emailBuyer, emailAdmin, emailError: emailError || undefined });
}

/* ── mp-preference: Checkout Pro real (orden pending_payment + init_point) ── */
async function actionMpPreference(req: Request, body: any) {
  const mp = mpEnv(req);
  if (!mp.token) return json({ ok: false, configured: false, env: mp.env }); // front cae a simulación
  const core = await insertOrderCore(req, body, "pending_payment");
  if (core.errorResponse) return core.errorResponse;
  const { order } = core;
  const items = (body.items as any[]).map((i) => ({
    title: String(i.name || "Producto"),
    quantity: Number(i.qty) || 1,
    unit_price: Number(i.price) || 0,
    currency_id: "CLP",
  }));
  if (Number(body.totals.shipping) > 0) {
    items.push({ title: "Envío", quantity: 1, unit_price: Number(body.totals.shipping), currency_id: "CLP" });
  }
  const back = (r: string) => `${mp.returnUrl}?mp=${r}&n=${encodeURIComponent(order.order_number)}`;
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${mp.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      payer: { email: core.email },
      external_reference: order.order_number,
      back_urls: { success: back("success"), failure: back("failure"), pending: back("pending") },
      auto_return: "approved",
      notification_url: `${SB_URL}/functions/v1/kanki-orders?action=mp-webhook`,
      statement_descriptor: "KANKI CO",
    }),
  });
  const pref = await res.json().catch(() => null);
  if (!res.ok || !pref?.init_point) {
    console.error("mp-preference error:", res.status, JSON.stringify(pref).slice(0, 300));
    return json({ ok: false, configured: true, env: mp.env, error: "no se pudo crear la preferencia MP" }, 502);
  }
  return json({ ok: true, orderNumber: order.order_number, orderId: order.id, initPoint: pref.init_point, env: mp.env });
}

/* ── mp-webhook: MP notifica un pago → si approved, confirmar orden + emails ── */
async function actionMpWebhook(req: Request) {
  const url = new URL(req.url);
  let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
  const topic = url.searchParams.get("type") || url.searchParams.get("topic") || "";
  if (!paymentId) {
    const body = await req.json().catch(() => ({}));
    paymentId = body?.data?.id || "";
  }
  if ((!MP_TOKEN_PROD && !MP_TOKEN_TEST) || !paymentId || (topic && topic !== "payment")) return json({ ok: true }); // ack para que MP no reintente
  // el pago puede venir del ambiente prod o test → probar con ambos tokens
  let pay: any = null;
  for (const tk of [MP_TOKEN_PROD, MP_TOKEN_TEST].filter(Boolean)) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    if (res.ok) { pay = await res.json().catch(() => null); break; }
  }
  if (!pay?.external_reference) return json({ ok: true });
  if (pay.status !== "approved") return json({ ok: true, status: pay.status });

  const rows = await rest(`orders?order_number=eq.${encodeURIComponent(pay.external_reference)}&select=*&limit=1`);
  const order = rows?.[0];
  if (!order) return json({ ok: true });
  if (order.status !== "pending_payment") return json({ ok: true, already: order.status }); // idempotente

  await rest(`orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed", updated_at: new Date().toISOString() }) });
  const mailCtx = {
    order_number: order.order_number, items: order.items || [], subtotal: order.subtotal, shipping_cost: order.shipping_cost,
    total: order.total, payment_label: "Mercado Pago", customer_email: order.customer_email, customer_phone: order.customer_phone,
    billing_rut: order.billing_rut,
    delivery: order.ship_method === "retiro"
      ? { mode: "retiro" }
      : { mode: "domicilio", region: order.shipping_region, city: order.shipping_comuna, address: order.shipping_address },
    ship_method: order.ship_method,
  };
  const mails = await sendOrderEmails(order.customer_email, mailCtx);
  return json({ ok: true, confirmed: order.order_number, ...mails });
}

async function actionTrack(body: any) {
  const n = String(body.orderNumber || "").trim().toUpperCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (!n || !email) return json({ error: "orderNumber y email requeridos" }, 400);
  const rows = await rest(`orders?order_number=eq.${encodeURIComponent(n)}&customer_email=eq.${encodeURIComponent(email)}&select=order_number,status,tracking_number,created_at,updated_at,items,subtotal,shipping_cost,total,ship_method,shipping_comuna,shipping_region,payment_method&limit=1`);
  if (!rows?.length) return json({ error: "No encontramos un pedido con ese número y correo" }, 404);
  return json({ ok: true, order: rows[0] });
}

async function actionAdminList(req: Request) {
  if (req.headers.get("x-admin-key") !== ADMIN_KEY || !ADMIN_KEY) return json({ error: "no autorizado" }, 401);
  const rows = await rest("orders?select=id,order_number,status,customer_email,customer_phone,total,payment_method,ship_method,shipping_comuna,shipping_region,tracking_number,created_at,items&order=created_at.desc&limit=50");
  return json({ ok: true, orders: rows });
}

async function actionAdminUpdate(req: Request, body: any) {
  if (req.headers.get("x-admin-key") !== ADMIN_KEY || !ADMIN_KEY) return json({ error: "no autorizado" }, 401);
  const allowed = ["pending_payment", "payment_uploaded", "confirmed", "preparing", "shipped", "delivered", "cancelled"];
  const patch: any = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!allowed.includes(body.status)) return json({ error: "status inválido" }, 400);
    patch.status = body.status;
  }
  if (body.tracking_number !== undefined) patch.tracking_number = body.tracking_number || null;
  const rows = await rest(`orders?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!rows?.length) return json({ error: "orden no encontrada" }, 404);
  return json({ ok: true, order: rows[0] });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    /* webhook MP llega por query param (GET o POST, body no-JSON posible) */
    if (new URL(req.url).searchParams.get("action") === "mp-webhook") {
      return await actionMpWebhook(req);
    }
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "create": return await actionCreate(req, body);
      case "mp-preference": return await actionMpPreference(req, body);
      case "track": return await actionTrack(body);
      case "admin-list": return await actionAdminList(req);
      case "admin-update": return await actionAdminUpdate(req, body);
      default: return json({ error: "action desconocida" }, 400);
    }
  } catch (e) {
    console.error("kanki-orders error:", e);
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
