# Despliegue (Frontend) — Vercel

Pasos para desplegar la parte frontend (Vite + React) en Vercel:

1. Asegúrate de que el repositorio esté en GitHub (o Git provider soportado).
2. Conecta el repo en https://vercel.com/new
3. En la configuración de proyecto en Vercel asegúrate de:
   - **Framework Preset:** Vite
   - **Install Command:** `npm install` (o `pnpm install`/`yarn` según uses)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. Opcional: ya incluimos `vercel.json` para forzar `@vercel/static-build` y `dist`.

## Variables de entorno recomendadas

En Vercel añade estas variables (Project > Settings > Environment Variables):

- `VITE_API_URL` : URL pública del backend (ej. `https://api.example.com`) o vacío si usarás rewrites/proxy.
- `VITE_LM_URL` : URL del servicio LLM (ej. `http://localhost:1234/v1`) para LM Studio local.

La app lee `VITE_API_URL` y `VITE_LM_URL` en tiempo de build/runtime y usa `''` y `http://localhost:1234/v1` como valores por defecto.

# Backend (opciones)

El backend se encuentra en `backend/` y es Python. Vercel no es ideal para aplicaciones Python persistentes o con dependencias complejas. Opciones:

- Desplegar el backend en una plataforma de contenedores (Render, Fly, Railway, AWS ECS) usando `dockerfile` en `backend/`.
- Convertir la API a funciones serverless (si la lógica lo permite) y desplegar en plataformas que soporten Python serverless (ver soporte actual de tu provider).
- Mantener el backend local y apuntar el frontend a la URL pública del backend una vez desplegado.

# Probar localmente

```bash
# instalar dependencias
npm install

# construir
npm run build

# servir localmente para probar (opcional)
npx serve dist
```

Si quieres, preparo el `vercel.json` (ya creado) y puedo generar instrucciones para desplegar el backend en Render o crear un pequeño proxy serverless si necesitas que todo esté en Vercel.
