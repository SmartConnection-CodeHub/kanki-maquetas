/* KANKI QAS — validadores y helpers puros (canónicos, testeables)
   Mismas implementaciones que el inline de checkout/index.html. */
(function () {
  'use strict';

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

  function validPhone(v) { const d = String(v || '').replace(/\D/g, ''); return d.length === 9 && d[0] === '9'; }

  function validRut(v) {
    const clean = String(v || '').replace(/\./g, '').replace(/-/g, '').toUpperCase().trim();
    if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
    const body = clean.slice(0, -1), dv = clean.slice(-1);
    let sum = 0, mul = 2;
    for (let i = body.length - 1; i >= 0; i--) { sum += +body[i] * mul; mul = mul === 7 ? 2 : mul + 1; }
    const res = 11 - (sum % 11);
    const dvCalc = res === 11 ? '0' : res === 10 ? 'K' : String(res);
    return dv === dvCalc;
  }

  /* Mapea una fila de customer_addresses a los campos del checkout */
  function mapAddressToForm(addr) {
    if (!addr) return null;
    return {
      region: addr.region || '',
      city: addr.comuna || '',
      address: addr.address || '',
      apt: addr.apt || '',
    };
  }

  /* Teléfono guardado en perfil ("+56912345678") → valor del input (9 dígitos) */
  function phoneToInput(v) {
    const d = String(v || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : '';
  }

  const api = { validEmail, validPhone, validRut, mapAddressToForm, phoneToInput };
  if (typeof window !== 'undefined') window.KankiUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
