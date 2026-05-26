# 📦 Producto Detalle · Spec ejecutable (gap #5 · 1.5d)

Generado War Room 2026-05-25.

## URL target PRD
`kanki.smconnection.cl/productos/?slug=X` (ruta YA existe · falta hidratar)

## Estado actual
- `/productos/index.html` (3.8 KB · ya hace fetch por `?slug=X` y redirige a `/` si no hay slug)
- Carga `loadProductDetail(slug)` y `renderProductDetail(...)` desde `/js/store.js`
- Carrito drawer + auth ya integrados

## Lo que falta (1.5 día)

### ABAP (4h)
- Implementar/completar `loadProductDetail(slug)` en `/js/store.js`:
  ```js
  async function loadProductDetail(slug) {
    const { data } = await supabase
      .from('products')
      .select(`*, variants:product_variants(*), images:product_images(*), reviews:product_reviews(*)`)
      .eq('slug', slug)
      .single()
    return data
  }
  ```
- Asegurar tablas Supabase tienen RLS:
  - `products.select` público
  - `product_variants.select` público
  - `product_images.select` público
  - `product_reviews.select` público para listar · auth-only para insert

### Fiori (6h)
Implementar `renderProductDetail(container, product)`:
1. **Galería swipe** (mobile horizontal scroll-snap · desktop grid)
2. **Selectores variante** (color buttons + talla pills)
3. **Stepper cantidad** (respeta stock)
4. **Tabs**: descripción · specs · envío y devoluciones
5. **Reviews** (estrellas + nombre + body)
6. **Productos relacionados** (query por tags)
7. **CTA sticky bottom mobile**: "Agregar al carrito · $X.XXX"
8. **Toast feedback** al agregar (reusa componente existente cart)

### Supabase queries necesarias
```sql
-- Schema esperado (verificar contra v2 export ya generado)
-- products: slug, title, description, price, price_old, gsm, material, fit
-- product_variants: product_id, color_name, color_hex, size, stock, sku
-- product_images: product_id, url, position, alt
-- product_reviews: product_id, user_id, rating, body, size_bought
-- product_related: product_id, related_id, position
```

### Maqueta de referencia
`maquetas/kanki-street/2026-05-09_140335-producto-detalle.html` · 25 KB · diseño definitivo

### Hoku
- Anti-fraude reviews: 1 review por user_id por product_id
- Validación size_bought (FK contra variants)

## Plan ejecutable (1.5d)

### Día 1 mañana · ABAP (4h)
- [ ] Verificar Supabase queries devuelven shape esperado
- [ ] Tests query con 3 productos reales seed
- [ ] RLS policies revisadas + smoke

### Día 1 tarde · Fiori (4h)
- [ ] Extraer JS/CSS de maqueta producto-detalle.html
- [ ] Integrar con `/js/store.js` y `/css/styles.css`
- [ ] Mobile-first 375px · scroll-snap galería

### Día 2 mañana · Camilita + Pipeline (2h)
- [ ] 5 smoke tests (happy + edge cases)
- [ ] Deploy QAS → smoke → PRD

## Linkeado
- `feedback_panchita_fiori_parallel.md` · Panchita=maqueta, Fiori=CSS prod
- `feedback_panchita_design_system.md` · /premium-effects skill
- `project_kanki_schema_drift_audit.md` · schema ya alineado
