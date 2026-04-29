-- =============================================================================
-- KANKI STREET — Supabase Schema
-- Versión: 1.0.0 | Fecha: 2026-04-29
-- 13 tablas: products, orders, order_notes, customers, waitlist,
--            cart_abandoned, drops, chat_conversations, chat_messages,
--            chat_summaries, partner_profiles, email_notifications, config
-- =============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- FUNCIÓN UPDATED_AT (trigger reutilizable)
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECUENCIA PARA ORDER NUMBER (K-0001, K-0002, ...)
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- =============================================================================
-- CORE: PRODUCTS
-- =============================================================================
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  compare_price NUMERIC(10, 2) CHECK (compare_price >= 0),
  category      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'sold_out', 'coming_soon')),
  images        TEXT[] NOT NULL DEFAULT '{}',
  sizes         TEXT[] NOT NULL DEFAULT '{}',
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_slug     ON products (slug);
CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_status   ON products (status);

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- CORE: ORDERS
-- =============================================================================
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number      TEXT NOT NULL UNIQUE DEFAULT ('K-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 4, '0')),
  customer_name     TEXT NOT NULL,
  customer_email    TEXT NOT NULL,
  customer_phone    TEXT,
  shipping_address  TEXT NOT NULL,
  shipping_comuna   TEXT NOT NULL,
  items             JSONB NOT NULL DEFAULT '[]',
  subtotal          NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  shipping_cost     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  total             NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  status            TEXT NOT NULL DEFAULT 'pending_payment'
                      CHECK (status IN (
                        'pending_payment', 'payment_uploaded', 'confirmed',
                        'preparing', 'shipped', 'delivered', 'cancelled'
                      )),
  payment_method    TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'webpay', 'mercadopago')),
  payment_proof_url TEXT,
  shipping_courier  TEXT,
  tracking_code     TEXT,
  source            TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'mercadolibre', 'instagram', 'whatsapp')),
  notes_customer    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_status         ON orders (status);
CREATE INDEX idx_orders_customer_email ON orders (customer_email);
CREATE INDEX idx_orders_order_number   ON orders (order_number);
CREATE INDEX idx_orders_created_at     ON orders (created_at DESC);
CREATE INDEX idx_orders_source         ON orders (source);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- CORE: ORDER_NOTES
-- =============================================================================
CREATE TABLE order_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_notes_order_id ON order_notes (order_id);

-- =============================================================================
-- CORE: CUSTOMERS
-- =============================================================================
CREATE TABLE customers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  phone          TEXT,
  addresses      JSONB[] NOT NULL DEFAULT '{}',
  total_orders   INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  total_spent    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
  loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_email   ON customers (email);
CREATE INDEX idx_customers_user_id ON customers (user_id);

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- ENGAGEMENT: WAITLIST
-- =============================================================================
CREATE TABLE waitlist (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  phone      TEXT,
  notified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, email)
);

CREATE INDEX idx_waitlist_product_id ON waitlist (product_id);
CREATE INDEX idx_waitlist_email      ON waitlist (email);
CREATE INDEX idx_waitlist_notified   ON waitlist (notified) WHERE notified = FALSE;

-- =============================================================================
-- ENGAGEMENT: CART_ABANDONED
-- =============================================================================
CREATE TABLE cart_abandoned (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          TEXT NOT NULL,
  email               TEXT,
  items               JSONB NOT NULL DEFAULT '[]',
  total               NUMERIC(10, 2) NOT NULL DEFAULT 0,
  recovery_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_wa_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  recovered           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cart_abandoned_session_id ON cart_abandoned (session_id);
CREATE INDEX idx_cart_abandoned_email      ON cart_abandoned (email);
CREATE INDEX idx_cart_abandoned_recovered  ON cart_abandoned (recovered) WHERE recovered = FALSE;

CREATE TRIGGER set_cart_abandoned_updated_at
  BEFORE UPDATE ON cart_abandoned
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- ENGAGEMENT: DROPS
-- =============================================================================
CREATE TABLE drops (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  launch_at   TIMESTAMPTZ NOT NULL,
  products    UUID[] NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'scheduled', 'live', 'ended')),
  cover_image TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drops_slug      ON drops (slug);
CREATE INDEX idx_drops_status    ON drops (status);
CREATE INDEX idx_drops_launch_at ON drops (launch_at);

CREATE TRIGGER set_drops_updated_at
  BEFORE UPDATE ON drops
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- CHAT MEMORY: CHAT_CONVERSATIONS
-- =============================================================================
CREATE TABLE chat_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chatbot_type    TEXT NOT NULL CHECK (chatbot_type IN ('storefront', 'admin', 'socios')),
  profile         TEXT CHECK (profile IN ('contable', 'comercial', 'abogado', 'logistica', 'marketing')),
  user_identifier TEXT NOT NULL,
  title           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_conversations_user_identifier ON chat_conversations (user_identifier);
CREATE INDEX idx_chat_conversations_chatbot_type    ON chat_conversations (chatbot_type);
CREATE INDEX idx_chat_conversations_profile         ON chat_conversations (profile);
CREATE INDEX idx_chat_conversations_created_at      ON chat_conversations (created_at DESC);

CREATE TRIGGER set_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- CHAT MEMORY: CHAT_MESSAGES
-- =============================================================================
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content         TEXT,
  tool_calls      JSONB,
  tool_results    JSONB,
  tokens_used     INTEGER CHECK (tokens_used >= 0),
  latency_ms      INTEGER CHECK (latency_ms >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conversation_id ON chat_messages (conversation_id);
CREATE INDEX idx_chat_messages_created_at      ON chat_messages (created_at);
CREATE INDEX idx_chat_messages_role            ON chat_messages (role);

-- =============================================================================
-- CHAT MEMORY: CHAT_SUMMARIES
-- =============================================================================
CREATE TABLE chat_summaries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  UUID NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
  summary          TEXT NOT NULL,
  messages_covered INTEGER NOT NULL DEFAULT 0 CHECK (messages_covered >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_summaries_conversation_id ON chat_summaries (conversation_id);

-- =============================================================================
-- SOCIOS: PARTNER_PROFILES
-- =============================================================================
CREATE TABLE partner_profiles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('contable', 'comercial', 'abogado', 'logistica', 'marketing')),
  permissions JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX idx_partner_profiles_user_id ON partner_profiles (user_id);
CREATE INDEX idx_partner_profiles_role    ON partner_profiles (role);
CREATE INDEX idx_partner_profiles_active  ON partner_profiles (active) WHERE active = TRUE;

-- =============================================================================
-- EMAILS: EMAIL_NOTIFICATIONS
-- =============================================================================
CREATE TABLE email_notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            TEXT NOT NULL CHECK (type IN (
                    'order_confirm', 'payment_confirmed', 'shipped', 'delivered',
                    'cart_recovery_2h', 'cart_recovery_24h', 'drop_launch',
                    'waitlist_confirm', 'stock_back', 'weekly_report',
                    'stock_alert', 'comprobante_uploaded', 'payment_timeout'
                  )),
  recipient_email TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_notifications_status         ON email_notifications (status) WHERE status = 'pending';
CREATE INDEX idx_email_notifications_recipient      ON email_notifications (recipient_email);
CREATE INDEX idx_email_notifications_type           ON email_notifications (type);
CREATE INDEX idx_email_notifications_created_at     ON email_notifications (created_at DESC);

-- =============================================================================
-- CONFIG
-- =============================================================================
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_config_updated_at
  BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- RLS — ROW LEVEL SECURITY
-- =============================================================================

-- products: lectura pública, escritura solo admin
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_anon_read"  ON products FOR SELECT USING (true);
CREATE POLICY "products_admin_write" ON products FOR ALL USING (auth.role() = 'service_role');

-- orders: admin full access; authenticated users ven solo sus órdenes
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_admin_all"     ON orders FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "orders_customer_read" ON orders FOR SELECT
  USING (auth.role() = 'authenticated' AND customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- order_notes: solo admin/service_role
ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_notes_admin_all" ON order_notes FOR ALL USING (auth.role() = 'service_role');

-- customers: admin full; usuario autenticado lee su propio registro
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_admin_all"  ON customers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "customers_self_read"  ON customers FOR SELECT
  USING (auth.role() = 'authenticated' AND user_id = auth.uid());
CREATE POLICY "customers_self_write" ON customers FOR UPDATE
  USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- waitlist: inserción pública (anon), lectura y gestión solo admin
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_anon_insert" ON waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "waitlist_admin_all"   ON waitlist FOR ALL USING (auth.role() = 'service_role');

-- cart_abandoned: service_role only
ALTER TABLE cart_abandoned ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_abandoned_admin_all" ON cart_abandoned FOR ALL USING (auth.role() = 'service_role');

-- drops: lectura pública para drops live; gestión solo admin
ALTER TABLE drops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drops_public_read" ON drops FOR SELECT USING (status IN ('live', 'scheduled'));
CREATE POLICY "drops_admin_all"   ON drops FOR ALL USING (auth.role() = 'service_role');

-- chat_conversations: el usuario ve sus propias conversaciones por user_identifier; admin todo
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_conv_admin_all" ON chat_conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "chat_conv_user_read" ON chat_conversations FOR SELECT
  USING (auth.role() = 'authenticated' AND user_identifier = auth.uid()::TEXT);

-- chat_messages: acceso via conversation (service_role manage, users solo sus mensajes)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_msg_admin_all"  ON chat_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "chat_msg_user_read"  ON chat_messages FOR SELECT
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id AND c.user_identifier = auth.uid()::TEXT
    )
  );

-- chat_summaries: service_role only
ALTER TABLE chat_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_summaries_admin_all" ON chat_summaries FOR ALL USING (auth.role() = 'service_role');

-- partner_profiles: socios ven su propio perfil; admin todo
ALTER TABLE partner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_admin_all"  ON partner_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "partner_self_read"  ON partner_profiles FOR SELECT
  USING (auth.role() = 'authenticated' AND user_id = auth.uid());

-- email_notifications: solo service_role
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_notif_admin_all" ON email_notifications FOR ALL USING (auth.role() = 'service_role');

-- config: lectura pública para claves no sensibles; escritura solo admin
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_public_read" ON config FOR SELECT USING (true);
CREATE POLICY "config_admin_write" ON config FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- SEED DATA — PRODUCTS (6 productos streetwear realistas)
-- =============================================================================
INSERT INTO products (id, name, slug, description, price, compare_price, category, status, images, sizes, stock) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'Poleron Kanki Clásico Negro',
  'poleron-kanki-clasico-negro',
  'Poleron oversized con bordado "KANKI STREET" en el pecho. Tela french terry 380g premium, interior suave. Ideal para el día a día con estilo.',
  34990, 44990, 'polerones', 'active',
  ARRAY['/products/poleron-negro-front.jpg', '/products/poleron-negro-back.jpg'],
  ARRAY['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  45
),
(
  '22222222-2222-2222-2222-222222222222',
  'Tee Kanki Block Letter Blanca',
  'tee-kanki-block-letter-blanca',
  'Camiseta de algodón peinado 200g, corte boxy. Estampado "KANKI" a toda costa frontal con tinta de alta densidad. Cuello ribete 2x2.',
  19990, 24990, 'tees', 'active',
  ARRAY['/products/tee-blanca-front.jpg', '/products/tee-blanca-back.jpg'],
  ARRAY['XS', 'S', 'M', 'L', 'XL'],
  80
),
(
  '33333333-3333-3333-3333-333333333333',
  'Gorra 6 Panel Kanki Beige',
  'gorra-6-panel-kanki-beige',
  'Gorra 6 paneles en twill de algodón 100%. Bordado frontal logo Kanki, cierre ajustable con hebilla metálica. Visera curva pre-pandeada.',
  14990, NULL, 'gorras', 'active',
  ARRAY['/products/gorra-beige-front.jpg', '/products/gorra-beige-side.jpg'],
  ARRAY['única'],
  30
),
(
  '44444444-4444-4444-4444-444444444444',
  'Jogger Kanki Cargo Carbón',
  'jogger-kanki-cargo-carbon',
  'Jogger cargo en twill stretch con 4 bolsillos funcionales. Elástico en cintura y tobilleras. Fit slim-tapered, muy versátil.',
  44990, 54990, 'joggers', 'active',
  ARRAY['/products/jogger-carbon-front.jpg', '/products/jogger-carbon-pocket.jpg'],
  ARRAY['XS', 'S', 'M', 'L', 'XL'],
  25
),
(
  '55555555-5555-5555-5555-555555555555',
  'Poleron Kanki Tie-Dye Arena',
  'poleron-kanki-tiedye-arena',
  'Poleron hoodie con efecto tie-dye hecho a mano. Cada prenda es única. Bolsillo canguro, cordones planos, tela 320g.',
  39990, NULL, 'polerones', 'coming_soon',
  ARRAY['/products/poleron-tiedye-1.jpg', '/products/poleron-tiedye-2.jpg'],
  ARRAY['S', 'M', 'L', 'XL'],
  0
),
(
  '66666666-6666-6666-6666-666666666666',
  'Tee Kanki Camo Verde',
  'tee-kanki-camo-verde',
  'Camiseta boxy en tela camo all-over. 100% algodón 220g. Etiqueta woven Kanki en lateral. Drop shoulder, fit relajado.',
  21990, 26990, 'tees', 'sold_out',
  ARRAY['/products/tee-camo-verde-front.jpg'],
  ARRAY['XS', 'S', 'M', 'L'],
  0
);

-- =============================================================================
-- SEED DATA — ORDERS (5 pedidos en distintos estados)
-- =============================================================================
INSERT INTO orders (
  order_number, customer_name, customer_email, customer_phone,
  shipping_address, shipping_comuna,
  items, subtotal, shipping_cost, total,
  status, payment_method, payment_proof_url,
  shipping_courier, tracking_code, source, notes_customer
) VALUES
(
  'K-0001', 'Javiera Morales', 'javiera.morales@gmail.com', '+56912345678',
  'Av. Providencia 1234, Dpto 45', 'Providencia',
  '[{"product_id":"11111111-1111-1111-1111-111111111111","name":"Poleron Kanki Clásico Negro","size":"M","qty":1,"price":34990},{"product_id":"33333333-3333-3333-3333-333333333333","name":"Gorra 6 Panel Kanki Beige","size":"única","qty":1,"price":14990}]',
  49980, 3990, 53970,
  'delivered', 'bank_transfer', NULL,
  'Starken', '1234567890', 'website', 'Entregar en conserjería si no estoy'
),
(
  'K-0002', 'Matías Fuentes', 'matiasf@hotmail.com', '+56987654321',
  'Los Leones 567', 'Las Condes',
  '[{"product_id":"22222222-2222-2222-2222-222222222222","name":"Tee Kanki Block Letter Blanca","size":"L","qty":2,"price":19990}]',
  39980, 3990, 43970,
  'shipped', 'bank_transfer', 'https://storage.kanki.cl/comprobantes/k0002.jpg',
  'CorreosChile', '9876543210', 'website', NULL
),
(
  'K-0003', 'Catalina Riquelme', 'cata.riquelme@gmail.com', '+56955512345',
  'Calle Larga 890', 'Ñuñoa',
  '[{"product_id":"44444444-4444-4444-4444-444444444444","name":"Jogger Kanki Cargo Carbón","size":"S","qty":1,"price":44990}]',
  44990, 3990, 48980,
  'confirmed', 'bank_transfer', 'https://storage.kanki.cl/comprobantes/k0003.jpg',
  NULL, NULL, 'website', NULL
),
(
  'K-0004', 'Diego Soto', 'dsoto.cl@gmail.com', '+56922298765',
  'Pedro de Valdivia 234', 'Vitacura',
  '[{"product_id":"11111111-1111-1111-1111-111111111111","name":"Poleron Kanki Clásico Negro","size":"XL","qty":1,"price":34990},{"product_id":"22222222-2222-2222-2222-222222222222","name":"Tee Kanki Block Letter Blanca","size":"XL","qty":1,"price":19990}]',
  54980, 3990, 58970,
  'payment_uploaded', 'bank_transfer', 'https://storage.kanki.cl/comprobantes/k0004.jpg',
  NULL, NULL, 'instagram', 'Vi el drop en Instagram, quiero la combinación completa'
),
(
  'K-0005', 'Valentina Lagos', 'valelagos@gmail.com', '+56933311223',
  'Gran Avenida 4567', 'San Miguel',
  '[{"product_id":"33333333-3333-3333-3333-333333333333","name":"Gorra 6 Panel Kanki Beige","size":"única","qty":1,"price":14990}]',
  14990, 3990, 18980,
  'pending_payment', 'bank_transfer', NULL,
  NULL, NULL, 'website', NULL
);

-- =============================================================================
-- SEED DATA — ORDER NOTES
-- =============================================================================
INSERT INTO order_notes (order_id, text, author) VALUES
(
  (SELECT id FROM orders WHERE order_number = 'K-0001'),
  'Pedido entregado con éxito. Cliente confirmó recepción por WhatsApp.',
  'admin'
),
(
  (SELECT id FROM orders WHERE order_number = 'K-0002'),
  'Enviado por CorreosChile tracking 9876543210. Estimado de llegada 2-3 días hábiles.',
  'admin'
),
(
  (SELECT id FROM orders WHERE order_number = 'K-0003'),
  'Comprobante verificado. Monto coincide: $43.970. Preparando pedido.',
  'admin'
),
(
  (SELECT id FROM orders WHERE order_number = 'K-0004'),
  'Comprobante recibido, pendiente de verificación bancaria.',
  'admin'
);

-- =============================================================================
-- SEED DATA — CONFIG
-- =============================================================================
INSERT INTO config (key, value) VALUES
(
  'store_info',
  '{
    "name": "Kanki Street",
    "tagline": "Streetwear con identidad propia",
    "email": "hola@kanki.cl",
    "whatsapp": "+56912345678",
    "instagram": "@kankistreet",
    "address": "Santiago, Chile",
    "currency": "CLP",
    "currency_symbol": "$"
  }'
),
(
  'bank_transfer',
  '{
    "bank": "Banco Estado",
    "account_type": "Cuenta Corriente",
    "account_number": "123456789",
    "rut": "12.345.678-9",
    "name": "Kanki Street SpA",
    "email": "pagos@kanki.cl",
    "payment_deadline_hours": 24
  }'
),
(
  'shipping_rates',
  '{
    "regions": [
      { "name": "Región Metropolitana", "courier": "Starken", "cost": 3990, "days": "2-3 hábiles" },
      { "name": "Zona Norte (I-IV)", "courier": "CorreosChile", "cost": 5990, "days": "5-7 hábiles" },
      { "name": "Zona Centro (V-IX)", "courier": "CorreosChile", "cost": 4990, "days": "3-5 hábiles" },
      { "name": "Zona Sur (X-XII)", "courier": "CorreosChile", "cost": 6990, "days": "7-10 hábiles" }
    ],
    "free_shipping_threshold": 79990
  }'
),
(
  'loyalty',
  '{
    "points_per_clp": 0.01,
    "min_redemption_points": 500,
    "points_to_clp_rate": 1
  }'
),
(
  'chat_config',
  '{
    "storefront_enabled": true,
    "admin_enabled": true,
    "socios_enabled": true,
    "fallback_chain": ["groq_llama3_70b", "gemini_flash_2", "deepseek_v3"],
    "max_tokens_per_message": 2048,
    "conversation_summary_threshold": 20
  }'
),
(
  'mercadolibre',
  '{
    "enabled": false,
    "sync_interval_minutes": 15,
    "auto_confirm_orders": false,
    "status": "fase_2_pendiente"
  }'
);
