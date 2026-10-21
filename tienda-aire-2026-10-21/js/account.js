/* KANKI QAS — perfil de comprador (customers + customer_addresses vía RLS)
   Requiere supabase-init.js + auth.js. Todas las funciones asumen sesión activa. */
(function () {
  'use strict';

  let _customer = null;

  /* Vincula (o crea) el customer del usuario autenticado. Cachea el resultado. */
  async function ensureCustomer(force) {
    if (_customer && !force) return _customer;
    const { data, error } = await supabase.rpc('ensure_customer');
    if (error) throw error;
    _customer = Array.isArray(data) ? data[0] : data;
    return _customer;
  }

  async function updateProfile(fields) {
    const c = await ensureCustomer();
    const allowed = {};
    ['name', 'last_name', 'phone', 'rut', 'birth_date'].forEach(k => {
      if (fields[k] !== undefined) allowed[k] = fields[k] === '' ? null : fields[k];
    });
    const { data, error } = await supabase.from('customers').update(allowed).eq('id', c.id).select().single();
    if (error) throw error;
    _customer = data;
    return data;
  }

  async function listAddresses() {
    const c = await ensureCustomer();
    const { data, error } = await supabase.from('customer_addresses')
      .select('*').eq('customer_id', c.id)
      .order('is_default', { ascending: false }).order('created_at');
    if (error) throw error;
    return data || [];
  }

  async function saveAddress(addr) {
    const c = await ensureCustomer();
    const row = {
      customer_id: c.id,
      label: addr.label || null,
      region: addr.region,
      comuna: addr.comuna,
      address: addr.address,
      apt: addr.apt || null,
    };
    if (addr.id) {
      const { data, error } = await supabase.from('customer_addresses').update(row).eq('id', addr.id).select().single();
      if (error) throw error;
      return data;
    }
    /* primera dirección → default automático */
    const existing = await listAddresses();
    row.is_default = existing.length === 0;
    const { data, error } = await supabase.from('customer_addresses').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteAddress(id) {
    const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
    if (error) throw error;
  }

  async function setDefaultAddress(id) {
    const c = await ensureCustomer();
    /* índice único parcial: primero soltar el default actual, luego marcar el nuevo */
    const { error: e1 } = await supabase.from('customer_addresses')
      .update({ is_default: false }).eq('customer_id', c.id).eq('is_default', true);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('customer_addresses')
      .update({ is_default: true }).eq('id', id);
    if (e2) throw e2;
  }

  /* Pedidos del usuario: policy orders_owner_read (user_id o email del JWT) */
  async function listMyOrders() {
    const { data, error } = await supabase.from('orders')
      .select('order_number,status,tracking_number,created_at,items,subtotal,shipping_cost,total,ship_method,payment_method')
      .order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    return data || [];
  }

  window.KankiAccount = { ensureCustomer, updateProfile, listAddresses, saveAddress, deleteAddress, setDefaultAddress, listMyOrders };
})();
