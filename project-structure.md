# Kanki Street — Next.js Project Structure

Stack: Next.js 15 + TypeScript 5 + Tailwind v4 + Supabase + App Router

---

## Árbol completo

```
kanki-street/
├── .env.local.example
├── .eslintrc.json
├── .gitignore
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
│
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   ├── manifest.json              ← PWA
│   └── products/                  ← imágenes de productos (dev)
│
└── src/
    ├── app/
    │   ├── layout.tsx             ← root layout: Inter font, GA4, metadata global
    │   ├── page.tsx               ← storefront home: hero, featured, drops activos
    │   ├── not-found.tsx
    │   ├── error.tsx
    │   │
    │   ├── (store)/               ← route group: canal público / cliente
    │   │   ├── layout.tsx         ← Navbar + Footer storefront
    │   │   ├── productos/
    │   │   │   └── page.tsx       ← catálogo con filtros por categoría
    │   │   ├── producto/
    │   │   │   └── [slug]/
    │   │   │       ├── page.tsx   ← PDP: galería, tallas, agregar al carrito
    │   │   │       └── _components/
    │   │   │           ├── ProductGallery.tsx   ← 'use client'
    │   │   │           ├── SizeSelector.tsx     ← 'use client'
    │   │   │           ├── AddToCart.tsx        ← 'use client'
    │   │   │           └── WaitlistForm.tsx     ← 'use client' (si sold_out)
    │   │   ├── carrito/
    │   │   │   └── page.tsx       ← 'use client': resumen carrito, editar cantidades
    │   │   ├── checkout/
    │   │   │   ├── page.tsx       ← form datos cliente + resumen + instrucciones transferencia
    │   │   │   ├── confirmacion/
    │   │   │   │   └── [orderNumber]/
    │   │   │   │       └── page.tsx  ← gracias + instrucciones pago
    │   │   │   └── _components/
    │   │   │       ├── CheckoutForm.tsx          ← 'use client': RHF + Zod
    │   │   │       ├── UploadComprobante.tsx     ← 'use client': subir imagen pago
    │   │   │       └── OrderSummary.tsx
    │   │   └── mi-cuenta/
    │   │       ├── page.tsx           ← mis pedidos, datos, puntos
    │   │       └── pedido/
    │   │           └── [orderNumber]/
    │   │               └── page.tsx   ← detalle de un pedido
    │   │
    │   ├── (admin)/               ← route group: panel administración
    │   │   ├── layout.tsx         ← sidebar admin + auth guard
    │   │   ├── page.tsx           ← dashboard: métricas clave, últimos pedidos
    │   │   ├── pedidos/
    │   │   │   ├── page.tsx       ← tabla pedidos con filtros y búsqueda
    │   │   │   └── [id]/
    │   │   │       └── page.tsx   ← detalle pedido: estado, notas, timeline
    │   │   ├── productos/
    │   │   │   ├── page.tsx       ← tabla productos con acciones
    │   │   │   ├── nuevo/
    │   │   │   │   └── page.tsx
    │   │   │   └── [id]/
    │   │   │       └── page.tsx   ← editar producto
    │   │   ├── clientes/
    │   │   │   ├── page.tsx
    │   │   │   └── [id]/
    │   │   │       └── page.tsx
    │   │   └── configuracion/
    │   │       └── page.tsx       ← bank transfer, shipping rates, store info
    │   │
    │   ├── (socios)/              ← route group: panel socios
    │   │   ├── layout.tsx         ← sidebar socios + auth guard por rol
    │   │   ├── page.tsx           ← hub socios: acceso rápido a chat por perfil
    │   │   └── [perfil]/          ← contable | comercial | abogado | logistica | marketing
    │   │       └── page.tsx       ← chat AI especializado según perfil
    │   │
    │   └── api/
    │       ├── v1/
    │       │   ├── products/
    │       │   │   ├── route.ts        ← GET /api/v1/products (list + filters)
    │       │   │   └── [slug]/
    │       │   │       └── route.ts    ← GET /api/v1/products/:slug
    │       │   ├── orders/
    │       │   │   ├── route.ts        ← POST /api/v1/orders (crear pedido)
    │       │   │   └── [id]/
    │       │   │       └── route.ts    ← GET, PATCH /api/v1/orders/:id
    │       │   ├── customers/
    │       │   │   └── route.ts        ← GET, POST /api/v1/customers
    │       │   ├── chat/
    │       │   │   └── stream/
    │       │   │       └── route.ts    ← POST /api/v1/chat/stream (SSE)
    │       │   ├── drops/
    │       │   │   └── route.ts        ← GET /api/v1/drops
    │       │   └── waitlist/
    │       │       └── route.ts        ← POST /api/v1/waitlist
    │       └── webhooks/
    │           ├── mercadolibre/
    │           │   └── route.ts        ← POST (Fase 2)
    │           └── shipit/
    │               └── route.ts        ← POST (Fase 2)
    │
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts           ← createBrowserClient (anon key)
    │   │   ├── server.ts           ← createServerClient (service_role)
    │   │   └── types.ts            ← Database types generados desde schema
    │   │
    │   ├── chat/
    │   │   ├── engine.ts           ← lógica compartida: fallback chain, memoria, streaming
    │   │   ├── memory.ts           ← resumen de conversaciones, spaced retention
    │   │   ├── prompts/
    │   │   │   ├── storefront-v1.ts     ← system prompt chatbot storefront
    │   │   │   ├── admin-v1.ts          ← system prompt panel admin
    │   │   │   ├── socios-contable-v1.ts
    │   │   │   ├── socios-comercial-v1.ts
    │   │   │   ├── socios-abogado-v1.ts
    │   │   │   ├── socios-logistica-v1.ts
    │   │   │   └── socios-marketing-v1.ts
    │   │   └── tools/
    │   │       ├── storefront-tools.ts  ← buscar producto, ver stock, consultar pedido
    │   │       ├── admin-tools.ts       ← actualizar estado pedido, ver métricas
    │   │       └── socios-tools.ts      ← consultar datos según perfil
    │   │
    │   ├── email/
    │   │   ├── send.ts             ← Gmail API vía Google Workspace
    │   │   └── templates/
    │   │       ├── order-confirm.ts
    │   │       ├── payment-confirmed.ts
    │   │       ├── shipped.ts
    │   │       ├── delivered.ts
    │   │       ├── cart-recovery.ts
    │   │       └── drop-launch.ts
    │   │
    │   ├── mercadolibre/           ← Fase 2
    │   │   ├── client.ts
    │   │   ├── sync-orders.ts
    │   │   └── sync-products.ts
    │   │
    │   ├── cart.ts                 ← lógica carrito (localStorage + cookies)
    │   ├── orders.ts               ← helpers de negocio para órdenes
    │   ├── products.ts             ← helpers fetch productos con cache
    │   └── utils.ts                ← formatCLP, slugify, etc.
    │
    └── components/
        ├── ui/                     ← componentes atómicos reutilizables
        │   ├── Button.tsx
        │   ├── Input.tsx
        │   ├── Badge.tsx           ← badge de estado (activo/agotado/próximamente)
        │   ├── Card.tsx
        │   ├── Modal.tsx           ← Radix Dialog wrapper
        │   ├── Toast.tsx
        │   ├── Spinner.tsx
        │   └── ImageFallback.tsx
        │
        └── store/                  ← componentes de negocio storefront
            ├── Navbar.tsx          ← 'use client': carrito badge, menú mobile
            ├── Footer.tsx
            ├── ProductCard.tsx     ← server component
            ├── ProductGrid.tsx     ← server component
            ├── CartDrawer.tsx      ← 'use client': drawer lateral
            ├── ChatWidget.tsx      ← 'use client': chatbot flotante
            ├── DropBanner.tsx      ← countdown + CTA
            └── OrderStatusBadge.tsx
```

---

## package.json — Dependencias

```json
{
  "name": "kanki-street",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "db:types": "supabase gen types typescript --local > src/lib/supabase/types.ts"
  },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.49.0",
    "@supabase/ssr": "^0.6.0",
    "react-hook-form": "^7.54.0",
    "zod": "^3.24.0",
    "@hookform/resolvers": "^3.10.0",
    "groq-sdk": "^0.9.0",
    "@google/generative-ai": "^0.24.0",
    "openai": "^4.77.0",
    "lucide-react": "^0.469.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-tooltip": "^1.1.6",
    "@radix-ui/react-select": "^2.1.4",
    "framer-motion": "^12.0.0",
    "sharp": "^0.33.5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.3.0",
    "postcss": "^8.5.0"
  }
}
```

---

## next.config.ts

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'storage.kanki.cl' },
    ],
  },
  experimental: {
    ppr: true,           // Partial Prerendering
  },
}

export default nextConfig
```

---

## tailwind.config.ts

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      colors: {
        kanki: {
          black:   '#0a0a0a',
          white:   '#f5f5f5',
          accent:  '#FFD700',   // dorado streetwear
          gray: {
            100: '#f0f0f0',
            800: '#1a1a1a',
            900: '#111111',
          }
        }
      },
    },
  },
  plugins: [],
}

export default config
```

---

## Convenciones del proyecto

| Regla | Detalle |
|-------|---------|
| Server Components | Por defecto en toda la `app/` |
| `'use client'` | Solo en nodos hoja interactivos (formularios, drawers, chatbot) |
| API routes | `/api/v1/` para REST; respuesta `{ data, meta }` o `{ error }` |
| Error format | `{ error: { code, message, details? } }` |
| Paginación | cursor-based en listas grandes |
| Validación | Zod schema reutilizado en cliente y Server Action |
| Autenticación | Supabase Auth + RLS; service_role solo en servidor |
| IA fallback | Groq 70B → Gemini Flash 2.0 → DeepSeek V3 (via engine.ts) |
| Emails | Gmail API (Google Workspace smconnection.cl) |
| Deploy | Vercel (frontend) — auto-deploy push a main |

---

## Flujo de checkout (transferencia manual)

```
Cliente completa form (RHF+Zod)
  → POST /api/v1/orders (crea orden K-XXXX, status: pending_payment)
  → Email automático con instrucciones de transferencia
  → Cliente sube comprobante (UploadComprobante.tsx)
    → PUT /api/v1/orders/:id { payment_proof_url, status: payment_uploaded }
  → Admin recibe notificación
  → Admin confirma pago → status: confirmed
  → Admin despacha → status: shipped (agrega courier + tracking)
  → Cliente recibe email de envío con tracking
```

---

## Fase 2 (poscarga — no bloquear Fase 1)

- MercadoLibre sync (bidireccional productos + órdenes)
- Shipit integración courier
- Webpay / MercadoPago como medios de pago adicionales
- Analytics PostHog
