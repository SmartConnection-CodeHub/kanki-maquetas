# 🛒 Checkout Flow · Spec ejecutable (gap #3 · 2-3d)

Generado War Room 2026-05-25 · listo para implementación ABAP + Fiori + Hoku.

## URLs target PRD

| URL | Función |
|---|---|
| `/checkout/contacto` | Paso 1: email + teléfono + ¿newsletter? |
| `/checkout/envio` | Paso 2: dirección + región + comuna + costo envío |
| `/checkout/pago` | Paso 3: WebPay/Khipu/Transferencia + términos |
| `/checkout/confirmacion?order={id}` | Paso 4: éxito · WhatsApp · email |
| `/api/checkout/init` | POST · crea orden draft · retorna `order_id` |
| `/api/checkout/contacto` | POST · valida + persiste paso 1 |
| `/api/checkout/envio` | POST · calcula envío + persiste |
| `/api/checkout/pago` | POST · genera link WebPay/Khipu o muestra datos bancarios |
| `/api/checkout/webhook/webpay` | POST · confirma pago + dispara email |
| `/api/checkout/webhook/khipu` | POST · idem para Khipu |

## DB design (usar tablas que ya existen)

### Tablas necesarias (ya existen en migrations PRD)
- `orders` (id, customer_id, status, subtotal, shipping, total, payment_method, created_at)
- `order_items` (order_id, product_id, variant_id, qty, unit_price)
- `customers` (id, email, phone, name, created_at)
- `payment_proofs` (order_id, screenshot_url, validated_at) → para transferencia manual
- `bank_accounts` (id, bank_name, account_type, account_number, holder_rut) → datos transferencia

### Tablas nuevas requeridas
```sql
CREATE TABLE shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  order_id uuid REFERENCES orders(id),
  street text NOT NULL,
  number text NOT NULL,
  unit text,
  comuna text NOT NULL,
  region text NOT NULL,
  zip text,
  notes text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE shipping_rates (
  id serial PRIMARY KEY,
  region text NOT NULL,
  base_cost int NOT NULL,
  per_kg_extra int DEFAULT 0,
  free_above int,
  estimated_days int,
  carrier text DEFAULT 'Chilexpress'
);

INSERT INTO shipping_rates(region, base_cost, free_above, estimated_days) VALUES
  ('Metropolitana', 3990, 50000, 2),
  ('Valparaíso', 4990, 50000, 3),
  ('Bío Bío', 5990, 80000, 4),
  ('Antofagasta', 7990, 100000, 5),
  ('Magallanes', 9990, 100000, 7);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  provider text NOT NULL,  -- 'webpay' | 'khipu' | 'transferencia'
  amount int NOT NULL,
  status text DEFAULT 'pending',  -- pending | paid | failed | refunded
  provider_transaction_id text,
  raw_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Maqueta visual · 3 pasos wizard mobile-first

Ver `kanki-maquetas/checkout/index.html` (HTML autocontenido con 3 vistas: paso 1, paso 2, paso 3 + confirmación).

Diseño:
- Stepper top: 1 → 2 → 3 → ✓
- Cards centradas mobile · max-width 480px
- CTAs sticky bottom mobile
- Estado guardado en `localStorage` entre pasos (recovery si cierra browser)
- Fallback: si checkout falla → cart drawer queda con items intactos

## Providers de pago · decisión

| Provider | Comisión | Setup | UX |
|---|---|---|---|
| **WebPay Plus** ⭐ | 3.49% | KIT + cert SII | redirect · cliente Chile conoce |
| **Khipu** | 1.0% | API rápido | embebido · transfer instantánea bancos |
| **Transferencia manual** | 0% | trivial | pantallazo WhatsApp · ~6h validación |

**Mi recomendación honest**: arrancar con **Khipu + Transferencia** (cero fee setup · MVP listo en 2-3 días). WebPay agregar después cuando volumen justifique.

## Anti-fraude (Hoku)

Mínimo viable:
- Rate limiting: max 5 órdenes / IP / hora
- Email validation: regex + verify MX record
- IP velocity check: 3+ órdenes desde misma IP en 10 min = flag
- CAPTCHA (Cloudflare Turnstile · gratis) en `/checkout/pago`

## Email transaccional

Templates necesarios (`emails/` folder):
- `order-confirmation.html` (al cliente · "tu pedido N° X")
- `order-paid.html` (cliente · pago confirmado)
- `order-shipped.html` (cliente · con tracking)
- `admin-new-order.html` (Guillermo+Martín · sale nueva)
- `payment-proof-received.html` (admin · pantallazo subido)

Provider: Resend o el Gmail SA ya configurado en Amplify env vars.

## Plan ejecutable (2-3d real)

### Día 1 · ABAP (8h)
- [ ] Migrations nuevas (shipping_addresses · shipping_rates · payment_transactions)
- [ ] API routes `/api/checkout/*` (4 endpoints + 2 webhooks)
- [ ] Integración Khipu (sandbox primero · luego prod)
- [ ] Email service config

### Día 2 · Fiori (8h)
- [ ] `/checkout/contacto/index.html` (form + validación Zod cliente)
- [ ] `/checkout/envio/index.html` (region selector + calc dinámico)
- [ ] `/checkout/pago/index.html` (3 opciones · tabs)
- [ ] `/checkout/confirmacion/index.html` (success state + WhatsApp + email)
- [ ] CSS responsive 375px primero
- [ ] localStorage state management

### Día 3 · Integración + QA (8h)
- [ ] Hoku: anti-fraude (rate limit · CAPTCHA · IP velocity)
- [ ] Camilita: smoke test 5 escenarios (happy + 4 edge cases)
- [ ] Pipeline: deploy QAS primero · smoke en QAS · luego PRD
- [ ] Webhook test con Khipu sandbox
- [ ] Email templates render check

## Bloqueantes para arrancar

1. **Schema export ya hecho hoy** ✅ (`supabase-schema.sql` v2 en kanki-maquetas)
2. ⏸️ Crear cuenta Khipu sandbox (Guillermo · 10 min · 1 form web)
3. ⏸️ Decidir email provider (Resend cuesta $20/mes · Gmail SA ya configurado FREE)

## Linkeado
- `reference_kanki_matrix.md` · gap #3 anclado
- `project_kanki_handoff_prd.md` · contexto técnico
- `feedback_local_smoke_before_push.md` · regla obligatoria smoke en PRD
- `project_kanki_schema_drift_audit.md` · DB ya alineada
