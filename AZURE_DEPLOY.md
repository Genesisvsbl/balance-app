# Despliegue en Azure Static Web Apps

Esta configuracion mantiene el mismo frontend de Next.js exportado como estatico y mueve las rutas `/api/*` a Azure Functions.

## 1. Crear Static Web App

En Azure Portal:

1. Buscar `Static Web Apps`.
2. Crear una nueva app.
3. Source: `GitHub`.
4. Repository: `Genesisvsbl/balance-app`.
5. Branch: `main`.
6. Build preset: `Custom`.
7. App location: `/`.
8. Api location: `api`.
9. Output location: `out`.

## 2. Variables de entorno

En Azure Static Web App > Settings > Environment variables agrega:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

En GitHub > repo `balance-app` > Settings > Secrets and variables > Actions agrega los mismos secretos y tambien:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`

Ese token lo entrega Azure cuando crea la Static Web App. Tambien aparece en Azure Portal > Static Web App > Manage deployment token.

## 3. Publicar

Haz push a `main` o ejecuta manualmente el workflow `Azure Static Web Apps CI/CD`.
