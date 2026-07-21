// KANKI — Edge Function kanki-orders (Fase 1.5 · 2026-07-20)
// Acciones: create (orden + 2 emails) · track (seguimiento) · admin-list · admin-update
// Escrituras con service_role (RLS intacto). Email vía Gmail API con service account
// smc-mailer (delegación de dominio, remitente MAIL_SENDER).

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAIL_SENDER = Deno.env.get("MAIL_SENDER") || "guillermo.gonzalez@smconnection.cl";
const ADMIN_NOTIFY = (Deno.env.get("ADMIN_NOTIFY") || "").split(",").map(s => s.trim()).filter(Boolean);
const ADMIN_KEY = Deno.env.get("KANKI_ADMIN_KEY") || "";
const SA_RAW = Deno.env.get("SMC_MAILER_KEY") || "";
const TRACK_URL = "https://qas.kanki.smconnection.cl/pedido/";

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
  <p style="font-size:12px;color:#6b7280">Gestionar: https://qas.kanki.smconnection.cl/admin.html (vista Pedidos)</p></div>`;
}

/* ── Acciones ── */
async function actionCreate(body: any) {
  const { contact, delivery, shipMethod, payMethod, billing, items, totals } = body;
  if (!contact?.email || !Array.isArray(items) || !items.length || !totals) {
    return json({ error: "payload incompleto" }, 400);
  }
  const email = String(contact.email).trim().toLowerCase();

  // customer: buscar o crear
  const found = await rest(`customers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
  let customerId = found?.[0]?.id;
  if (!customerId) {
    const created = await rest("customers", {
      method: "POST",
      body: JSON.stringify({ email, name: email.split("@")[0], phone: contact.phone || null, address: delivery?.address || null }),
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
          order_number: orderNumber,
          status: "confirmed",
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
  if (!order) return json({ error: "no se pudo generar N° de orden" }, 500);

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

  // emails (fallo de correo NO tumba la orden)
  const payLabel = payMethod === "paypal" ? "PayPal" : payMethod === "mercadopago" ? "Mercado Pago" : "Webpay Plus";
  const mailCtx = {
    order_number: order.order_number, items, subtotal: totals.subtotal, shipping_cost: totals.shipping,
    total: totals.total, payment_label: payLabel, customer_email: email, customer_phone: contact.phone,
    billing_rut: billing?.rut, delivery: delivery || { mode: "retiro" }, ship_method: shipMethod,
  };
  let emailBuyer = false, emailAdmin = false, emailError = "";
  try {
    const token = await gmailToken();
    try { await sendMail(token, [email], `Pedido confirmado ${order.order_number} — KANKI & CO`, emailComprador(mailCtx)); emailBuyer = true; } catch (e) { emailError += String(e).slice(0, 200); }
    if (ADMIN_NOTIFY.length) {
      try { await sendMail(token, ADMIN_NOTIFY, `🛒 Pedido nuevo ${order.order_number} · ${fmt(totals.total)}`, emailInterno(mailCtx)); emailAdmin = true; } catch (e) { emailError += " | " + String(e).slice(0, 200); }
    }
  } catch (e) {
    emailError = String(e).slice(0, 300);
  }

  return json({ ok: true, orderNumber: order.order_number, orderId: order.id, emailBuyer, emailAdmin, emailError: emailError || undefined });
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "create": return await actionCreate(body);
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
