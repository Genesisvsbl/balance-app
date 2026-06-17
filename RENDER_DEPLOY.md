# Despliegue en Render

Esta opcion mantiene la misma interfaz de BALANCE y sirve las rutas `/api/*` desde un servidor Node sencillo.

## Configuracion

- New: `Web Service`
- Repository: `Genesisvsbl/balance-app`
- Branch: `main`
- Runtime: `Node`
- Build command: `npm install && npm run build`
- Start command: `node server/render-server.mjs`
- Plan: `Free`

## Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
