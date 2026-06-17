# Despliegue en Cloudflare Pages

## Configuracion

- Framework preset: `Worker`
- Build command: `npm run build`
- Root directory: `/`
- Deploy command: `npx wrangler deploy`

## Variables

En Cloudflare Pages > Settings > Environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Las funciones de Cloudflare quedan en:

- `/api/auth-login`
- `/api/balance-runs`
- `/api/balance-run`
