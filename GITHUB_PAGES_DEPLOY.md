# Despliegue en GitHub Pages

Esta opcion no usa Netlify, Vercel, Azure, Render ni Cloudflare. La app queda estatica en GitHub Pages y se conecta directo a Supabase con funciones RPC seguras.

## 1. Ejecutar SQL en Supabase

Abrir Supabase > SQL Editor y ejecutar el archivo:

`supabase_github_pages_rpc.sql`

## 2. Variables en GitHub

Repositorio `Genesisvsbl/balance-app` > Settings > Secrets and variables > Actions > New repository secret:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## 3. Activar Pages

Repositorio > Settings > Pages:

- Source: `GitHub Actions`

Luego ir a Actions y correr `Deploy GitHub Pages`.

El enlace queda:

`https://genesisvsbl.github.io/balance-app/`
