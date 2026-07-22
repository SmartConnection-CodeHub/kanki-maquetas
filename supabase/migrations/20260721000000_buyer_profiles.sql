-- KANKI · Perfiles de comprador (2026-07-21)
-- Aditiva sobre schema LIVE verificado (customers ya tiene user_id; orders no lo tenía).
-- Incluye fix de seguridad: reemplaza orders_public_read / order_items_public_read (qual=true,
-- exponían PII con anon key) y orders_auth_update (cualquier autenticado editaba cualquier orden)
-- por policies con scope dueño/admin/socio. Los INSERT públicos antiguos se mantienen (checkout PRD legacy).

-- 1 · customers: campos de perfil
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS rut text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date date;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id_unique
  ON public.customers (user_id) WHERE user_id IS NOT NULL;

-- 2 · direcciones guardadas (nueva; shipping_addresses de repo nunca se aplicó al live)
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text,
  region text NOT NULL,
  comuna text NOT NULL,
  address text NOT NULL,
  apt text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON public.customer_addresses (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
  ON public.customer_addresses (customer_id) WHERE is_default;

-- 3 · orders: vínculo al usuario autenticado
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);

-- 4 · RLS customer_addresses: solo el dueño
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_addresses_owner_all ON public.customer_addresses;
CREATE POLICY customer_addresses_owner_all ON public.customer_addresses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.user_id = auth.uid()));

-- 5 · RLS customers: el dueño ve y edita su perfil (admin_read ya existe)
DROP POLICY IF EXISTS customers_owner_read ON public.customers;
CREATE POLICY customers_owner_read ON public.customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS customers_owner_update ON public.customers;
CREATE POLICY customers_owner_update ON public.customers
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6 · FIX seguridad orders/order_items
DROP POLICY IF EXISTS orders_public_read ON public.orders;
DROP POLICY IF EXISTS orders_auth_update ON public.orders;
DROP POLICY IF EXISTS orders_owner_read ON public.orders;
CREATE POLICY orders_owner_read ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(customer_email) = lower(auth.email()));

DROP POLICY IF EXISTS order_items_public_read ON public.order_items;
DROP POLICY IF EXISTS order_items_owner_read ON public.order_items;
CREATE POLICY order_items_owner_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.user_id = auth.uid() OR lower(o.customer_email) = lower(auth.email()))));
DROP POLICY IF EXISTS order_items_admin_read ON public.order_items;
CREATE POLICY order_items_admin_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
DROP POLICY IF EXISTS order_items_socio_read ON public.order_items;
CREATE POLICY order_items_socio_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'socio'));

-- 7 · RPC ensure_customer: vincula (claim por email) o crea el customer del usuario autenticado
CREATE OR REPLACE FUNCTION public.ensure_customer()
RETURNS public.customers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.customers;
  cid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no autenticado';
  END IF;
  SELECT * INTO c FROM customers WHERE user_id = auth.uid() LIMIT 1;
  IF FOUND THEN RETURN c; END IF;
  SELECT id INTO cid FROM customers
    WHERE user_id IS NULL AND lower(email) = lower(auth.email())
    ORDER BY created_at LIMIT 1;
  IF cid IS NOT NULL THEN
    UPDATE customers SET user_id = auth.uid() WHERE id = cid RETURNING * INTO c;
    RETURN c;
  END IF;
  INSERT INTO customers (email, name, user_id)
    VALUES (lower(auth.email()),
            COALESCE(auth.jwt()->'user_metadata'->>'full_name', split_part(auth.email(), '@', 1)),
            auth.uid())
    RETURNING * INTO c;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.ensure_customer() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_customer() TO authenticated;
