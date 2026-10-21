'use strict';
/* Catálogo vivo: la base (kanki-orders · stock-publico) manda en todos los campos visibles.
   catalog.js (foto del 19-10) queda solo como respaldo si la red falla o tarda más de 4 s. */
(() => {
  const ENDPOINT = 'https://yjjtbwfgtoepsevvkzta.supabase.co/functions/v1/kanki-orders';
  const TIMEOUT = 4000;
  const catalog = window.KANKI_CATALOG;
  const fallback = catalog.products;
  const html = document.documentElement;

  const brandOf = category => {
    const c = String(category || '').toLowerCase();
    if (/essentials|fear of god|fog/.test(c)) return {key: 'essentials', name: 'Fear of God Essentials'};
    if (c.includes('grizzly')) return {key: 'grizzly', name: 'Grizzly'};
    if (/stussy|stüssy/.test(c)) return {key: 'stussy', name: 'Stüssy'};
    if (c.includes('luked')) return {key: 'luked', name: 'Luked'};
    return null;
  };
  // Solo un hint de proporción; la foto, el nombre y el precio salen de la base.
  const dimsBySlug = new Map(fallback.map(p => [p.sourceSlug, [p.width, p.height]]));

  /* Último catálogo vivo que vio este navegador: si la base tarda, es mejor
     respaldo que la foto del 19-10. */
  const CACHE_KEY = 'kanki_maqueta_catalogo_v1';
  const leerCache = () => { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && Array.isArray(c.productos) ? c : null; } catch (e) { return null; } };
  const guardarCache = d => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ productos: d.productos, at: Date.now() })); } catch (e) {} };
  let mostrado = 'ninguno';

  function mapProduct(row) {
    const brand = brandOf(row.category);
    if (!brand || !row.slug || !row.image) return null;
    if (row.restringido) return null;   /* preventas privadas: no se muestran en la vitrina pública */
    const stock = Math.max(0, Number(row.stock) || 0);
    const bySize = row.stock_by_size && Object.keys(row.stock_by_size).length ? row.stock_by_size : null;
    const type = /hoodie|poler[oó]n/i.test(row.name) ? 'hoodie' : 'tee';
    const [width, height] = dimsBySlug.get(row.slug) || [800, 1000];
    const gallery = [row.image, ...(row.images || [])].filter((u, i, a) => u && a.indexOf(u) === i);
    return {
      id: row.slug, sourceSlug: row.slug, brandKey: brand.key, brand: brand.name, name: row.name,
      price: Number(row.price) || 0, comparePrice: Number(row.compare_price) || 0, badge: row.badge || '',
      type, image: row.image, images: gallery, width, height, stock, stockBySize: bySize,
      soldOut: row.status === 'sold_out' || stock <= 0, status: row.status,
      description: `${type === 'hoodie' ? 'Polerón' : 'Polera'} de ${brand.name} del catálogo de Kanki.`
    };
  }

  // La petición parte inline en el <head> (index.html); el tope de 4 s cuenta desde ese momento.
  const elapsed = performance.now() - (window.KANKI_T0 || performance.now());
  const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), Math.max(0, TIMEOUT - elapsed)));
  const request = window.KANKI_FETCH || fetch(ENDPOINT, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'stock-publico'})
  }).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));

  const aplicar = data => {
    const live = data.productos.map(mapProduct).filter(Boolean);
    if (!live.length) throw new Error('catálogo vacío');
    // Orden estable: con stock primero dentro de cada marca; los agotados al final.
    live.sort((a, b) => Number(a.soldOut) - Number(b.soldOut));
    catalog.products = live;
    catalog.updatedAt = new Date().toISOString();
    catalog.live = true;
  };

  window.KANKI_READY = Promise.race([request, timeout]).then(data => {
    if (data === 'timeout' || !data || !data.ok || !Array.isArray(data.productos)) throw new Error('sin datos');
    aplicar(data); guardarCache(data); mostrado = 'vivo';
  }).catch(error => {
    const cache = leerCache();
    try { if (cache) { aplicar(cache); catalog.live = false; mostrado = 'cache'; } } catch (e) {}
    if (mostrado !== 'cache') { mostrado = 'estatico'; catalog.live = false; }
    console.info('[Kanki maqueta] usando respaldo (' + mostrado + '):', error.message);
  }).then(() => {
    // Quita el "cargando" una vez que app.js y showcase.js ya pintaron con los datos definitivos.
    setTimeout(() => html.classList.remove('kanki-loading'), 60);
  });
  /* La base llegó tarde (después del tope): los datos vivos no se pierden.
     Se guardan y, si el cliente todavía no se metió en la página, se repinta
     con ellos. Nunca quedarse con precios o fotos viejas (Atlas P212). */
  /* Se espera a que termine la decisión de arriba: request.then corría ANTES
     que la cadena de KANKI_READY y veía mostrado='ninguno' aunque los datos
     ya estuvieran en vivo (el aviso salía en todas las cargas). */
  Promise.all([request, window.KANKI_READY]).then(([data]) => {
    if (mostrado === 'vivo' || !data || !data.ok || !Array.isArray(data.productos)) return;
    guardarCache(data);
    /* Sin recargar a la fuerza (con mala señal cortaría una compra a medias):
       un aviso discreto que el cliente decide tocar. */
    if (document.getElementById('kk-datos-nuevos')) return;
    const aviso = document.createElement('button');
    aviso.id = 'kk-datos-nuevos';
    aviso.type = 'button';
    aviso.textContent = 'Hay precios y stock actualizados · Toca para ver';
    aviso.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;min-height:44px;padding:10px 18px;border:0;border-radius:999px;background:#2f4a6e;color:#fff;font:600 13px/1.2 DM,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer';
    aviso.addEventListener('click', () => location.reload());
    document.body.appendChild(aviso);
  }).catch(() => {});
})();
