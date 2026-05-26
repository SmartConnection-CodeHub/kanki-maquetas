# 👥 Ports a PRD · Embajadores #6 + Panel Socios #7 + Login #10

Generado War Room 2026-05-25.

## Estado actual

| Item | QAS (maqueta) | PRD (app real) | Gap |
|---|---|---|---|
| Embajadores | ✅ 49 KB inline | ✅ 8.8 KB placeholder (hoy) | placeholder → port real |
| Panel socios | ✅ 452 KB inline | ❌ NO existe | crear nuevo |
| Login & Emails | ✅ maqueta | ✅ /mi-cuenta/ básico | ampliar |

## #6 Embajadores port real (1.5d)

### Origen
`qas.kanki.smconnection.cl/embajadores/index.html` (49 KB inline)

### Destino
`kanki.smconnection.cl/embajadores/index.html` (actualmente placeholder 8.8 KB)

### Lo que se mantiene
- Nav modular existente · cart drawer · scripts modulares (commit `2bf9dd1`)
- URL pública (no romper)

### Lo que se agrega
1. **Hero** con video Skate.mp4 (ya en S3 QAS · subir a Amplify PRD)
2. **Sección beneficios** rica (no 4 cards · expandir a 6-8 con iconos)
3. **Formulario postulación** con campos:
   - Nombre · email · teléfono · Instagram · TikTok · ciudad
   - Deportes (multi-select: surf · skate · snow · BMX · otro)
   - Seguidores rango (0-1k / 1k-5k / 5k-20k / 20k+)
   - Video presentación URL (Drive/IG/YT)
   - Por qué Kanki (textarea)
4. **Galería actuales** (3-4 embajadores actuales con foto + IG)
5. **FAQ** (4-6 preguntas frecuentes)
6. **CTA WhatsApp** mantener

### Supabase nueva tabla
```sql
CREATE TABLE ambassador_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, email text NOT NULL, phone text,
  instagram text, tiktok text, city text,
  sports text[], followers_range text,
  video_url text, motivation text,
  status text DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ambassador_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert public" ON ambassador_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "select admin" ON ambassador_applications FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','socio'))
);
```

### Plan ejecutable
- [ ] ABAP: migration + RLS + email notif admin nueva postulación · 3h
- [ ] Fiori: port maqueta → modular CSS + JS form validation · 8h
- [ ] Camilita: smoke 5 escenarios · 1h
- **Total**: 1.5d

---

## #7 Panel socios port a PRD (2d)

### Origen
`qas.kanki.smconnection.cl/panel-socios.html` (452 KB inline · MUY pesado · contiene KPIs simulados + charts)

### Destino
`kanki.smconnection.cl/socios/index.html` (existe placeholder 4.7 KB con KPIs cargando vía `socios.js`)

### Lo que falta cargar (datos reales Supabase)

Métricas necesarias en `loadSociosDashboard()` (`/js/socios.js`):

```js
async function loadSociosDashboard() {
  // KPIs
  const { data: kpis } = await supabase.rpc('socios_kpis')
  // Returns: total_orders, total_revenue, avg_ticket, total_customers, ambassadors_count

  // Distribution
  const { data: dist } = await supabase.rpc('socios_distribution')
  // Returns: by_status [{status, count}], by_region [{region, count}]

  // Projection
  const { data: proj } = await supabase.rpc('socios_projection')
  // Returns: month1, q1, h1, year1, year2 (CLP)
}
```

### Supabase functions necesarias
```sql
CREATE FUNCTION socios_kpis() RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'total_orders', (SELECT count(*) FROM orders WHERE status = 'paid'),
    'total_revenue', (SELECT coalesce(sum(total), 0) FROM orders WHERE status = 'paid'),
    'avg_ticket', (SELECT coalesce(avg(total), 0) FROM orders WHERE status = 'paid'),
    'total_customers', (SELECT count(distinct customer_id) FROM orders),
    'ambassadors_count', (SELECT count(*) FROM ambassador_applications WHERE status = 'approved')
  )
$$ LANGUAGE sql SECURITY DEFINER;

CREATE FUNCTION socios_distribution() RETURNS jsonb AS $$ ... $$;
CREATE FUNCTION socios_projection() RETURNS jsonb AS $$ ... $$;
```

RLS: estas functions SECURITY DEFINER + check role = 'socio' en RPC.

### Plan ejecutable
- [ ] ABAP: 3 RPC functions + RLS + seed data si vacío · 4h
- [ ] Fiori: implementar `loadSociosDashboard` + charts (Chart.js · ya en deps?) · 6h
- [ ] Pipeline + Camilita: deploy + smoke · 2h
- **Total**: 2d

---

## #10 Login & Emails port (1d)

### Estado
- PRD ya tiene `/mi-cuenta/index.html` y auth modular en `/js/auth.js`
- Auth Supabase ya funciona (showLoginModal · logout · session)

### Lo que falta
1. **Email templates** transaccionales (5 templates · gap del checkout)
2. **Magic link** (passwordless) como opción primaria
3. **Reset password** flow completo
4. **Email confirmation** (verify_email at signup)
5. **Templates branded** (no defaults Supabase)

### Plan ejecutable
- [ ] ABAP: configurar SMTP custom (Gmail SA ya en env vars) + 5 templates HTML
- [ ] Fiori: maqueta reset password page + verify email page
- [ ] Hoku: anti-bot signup (CAPTCHA Cloudflare Turnstile)
- **Total**: 1d

---

## Bloqueantes cross
1. ✅ Schema drift ya re-exportado hoy
2. ⏸️ Decidir SMTP: Resend ($20/mes) vs Gmail SA ya en env (FREE)
3. ⏸️ Chart.js dependency confirmar en `kanki-street/package.json`

## Linkeado
- `project_kanki_handoff_prd.md` · plan handoff completo
- `feedback_kanki_local_first.md` · regla maqueta local primero
