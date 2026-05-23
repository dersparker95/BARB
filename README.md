# BARB

Sistema web para gestión industrial con:

- **Frontend:** React + Vite
- **Backend:** FastAPI + Python
- **Base de datos:** PostgreSQL
- **Ejecución local:** Docker + Docker Compose

---

## 1) Qué debes saber antes de empezar

Este proyecto funciona con Docker, pero hay 3 puntos importantes detectados en la auditoría:

1. **El servicio de PostgreSQL no está usando un volumen persistente real**
   - En `docker-compose.yml` existe `postgres_data`, pero no está montado en el contenedor de `db`.
   - Resultado: si destruyes el contenedor, la data puede perderse.

2. **La ruta de scripts SQL de inicialización no coincide con la carpeta del repositorio**
   - El `docker-compose.yml` monta `./init-scripts:/docker-entrypoint-initdb.d`
   - Pero en este repositorio la carpeta visible es `initScrips/`
   - Antes del primer arranque, debes **renombrar la carpeta** o **corregir el volumen** en `docker-compose.yml`.

3. **La app frontend usa variables de entorno en build time**
   - El frontend se compila dentro de la imagen Docker.
   - Si cambias `VITE_API_URL` o `VITE_LM_STUDIO_URL`, debes reconstruir la imagen del frontend.

---

## 2) Estructura relevante del proyecto

```text
.
├── docker-compose.yml
├── frontend/
│   └── dockerfile
├── backend/
│   ├── Dockerfile
│   ├── rag_backend.py
│   └── requirements.txt
├── initScrips/
│   └── 01_tablas.sql
├── .env
└── README.md
```

---

## 3) Requisitos previos

Instala lo siguiente:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Docker Compose v2
- Opcional, si vas a usar el chat RAG:
  - [LM Studio](https://lmstudio.ai)

Verifica que Docker esté activo:

```bash
docker --version
docker compose version
```

---

## 4) Archivo `.env` inicial

Crea o ajusta el archivo `.env` en la raíz del proyecto con valores locales.

### Ejemplo recomendado para desarrollo local

```env
VITE_API_URL=http://localhost:9000/api
VITE_LM_STUDIO_URL=http://host.docker.internal:1234/v1
```

### Notas

- `VITE_API_URL` debe apuntar al backend local.
- `VITE_LM_STUDIO_URL` solo se usa si vas a conectar el backend con LM Studio.
- Si usas una URL remota o de túnel, el frontend se compilará contra esa URL.

---

## 5) Ajuste obligatorio antes del primer arranque

El `docker-compose.yml` espera esta carpeta:

```text
./init-scripts
```

Pero el repositorio trae:

```text
./initScrips
```

Debes hacer **una** de estas dos cosas:

### Opción A: renombrar la carpeta
Renombra:

```text
initScrips -> init-scripts
```

### Opción B: corregir `docker-compose.yml`
Cambia el volumen del servicio `db` para que apunte a la carpeta real del proyecto.

Si no haces esto, PostgreSQL no ejecutará los scripts de inicialización al crear el contenedor por primera vez.

---

## 6) Levantar el proyecto desde cero

### Paso 1: clonar o ubicarse en el proyecto

```bash
cd BARB-main
```

### Paso 2: preparar `.env`

Asegúrate de que el archivo `.env` tenga al menos:

```env
VITE_API_URL=http://localhost:9000/api
VITE_LM_STUDIO_URL=http://host.docker.internal:1234/v1
```

### Paso 3: revisar la carpeta de inicialización de PostgreSQL

Confirma que el script SQL esté en la ruta que usa Docker Compose.

Ejemplo esperado:

```text
init-scripts/01_tablas.sql
```

### Paso 4: construir y levantar los contenedores

```bash
docker compose up --build
```

Si prefieres dejarlo en segundo plano:

```bash
docker compose up --build -d
```

---

## 7) URLs de acceso

Una vez levantado el stack:

- **Frontend:** http://localhost
- **Backend:** http://localhost:9000
- **Health check:** http://localhost:9000/health
- **API base:** http://localhost:9000/api

---

## 8) Verificación rápida

### Backend

```bash
curl http://localhost:9000/health
```

Respuesta esperada:

```json
{
  "status": "online",
  "work_orders": 4,
  "machines": 5,
  "documents": 3
}
```

### Frontend

Abre:

```text
http://localhost
```

### Endpoints útiles

```bash
curl http://localhost:9000/api/disciplines
curl http://localhost:9000/api/technicians
curl http://localhost:9000/api/machines
curl http://localhost:9000/api/work-orders
```

---

## 9) Base de datos y scripts SQL

### Inicialización automática de PostgreSQL

Docker ejecuta automáticamente los scripts que estén en:

```text
/docker-entrypoint-initdb.d
```

pero **solo la primera vez** que el volumen de datos está vacío.

### Si cambias un script SQL

Si modificas los archivos SQL y quieres que se vuelvan a ejecutar:

```bash
docker compose down -v
docker compose up --build
```

### Importante sobre este proyecto

El backend `rag_backend.py` crea algunas tablas con SQLAlchemy al arrancar:

- `disciplines`
- `technicians`
- `machines`
- `work_orders`

Además, el proyecto incluye un script SQL más amplio en:

```text
initScrips/01_tablas.sql
```

Ese script está pensado para la estructura industrial completa.  
Si quieres cargarlo manualmente, primero asegúrate de que esa carpeta esté montada dentro del contenedor de PostgreSQL.

Ejemplo de ejecución manual dentro del contenedor:

```bash
docker compose exec db psql -U barb_admin -d barb_database -f /docker-entrypoint-initdb.d/01_tablas.sql
```

---

## 10) LM Studio y chat RAG

El backend intenta conectarse a LM Studio en:

```text
http://host.docker.internal:1234/v1
```

### Si quieres usar el chat

1. Instala LM Studio
2. Carga un modelo local
3. Inicia el servidor local en el puerto `1234`
4. Verifica que responda

```bash
curl http://localhost:1234/v1/models
```

### Si no vas a usar LM Studio

El resto del sistema funciona igual, pero los endpoints de chat devolverán error si intentan usar el modelo local y no está activo.

---

## 11) Comandos útiles de operación

### Ver logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

### Detener el stack

```bash
docker compose down
```

### Detener y borrar volúmenes

```bash
docker compose down -v
```

### Reconstruir una sola imagen

```bash
docker compose build backend
docker compose build frontend
```

---

## 12) Auditoría resumida de Docker

### docker-compose.yml

- El backend y el frontend están correctamente definidos para Docker Compose.
- El backend expone el puerto `9000`.
- El frontend expone el puerto `80`.
- **Problemas detectados:**
  - falta persistencia real para PostgreSQL porque `postgres_data` no está montado en `db`
  - la ruta de init scripts no coincide con la carpeta real del repo
  - las credenciales de PostgreSQL están hardcodeadas

### backend/Dockerfile

- La imagen base es correcta para FastAPI.
- Instala dependencias del sistema necesarias para compilación.
- Usa `uvicorn --reload`, útil para desarrollo.
- **Observación:** para producción, lo normal sería quitar `--reload`.

### frontend/dockerfile

- El build multietapa con Node + Nginx está bien planteado.
- Sirve el build estático en Nginx.
- **Observación:** cualquier cambio en variables `VITE_*` exige rebuild.

### backend/requirements.txt

- Las dependencias están alineadas con FastAPI, SQLAlchemy, PostgreSQL y RAG.
- No se detectó error de sintaxis en el archivo.

### `.env`

- Está orientado al frontend y contiene variables `VITE_*`.
- **Recomendación:** usar valores locales para Docker, no túneles remotos, salvo que ese sea el objetivo.

---

## 13) Troubleshooting

### El frontend abre, pero no carga datos

Revisa que `VITE_API_URL` apunte al backend correcto:

```env
VITE_API_URL=http://localhost:9000/api
```

Luego reconstruye:

```bash
docker compose up --build
```

### PostgreSQL no ejecuta el SQL inicial

Revisa:

- que la carpeta montada exista
- que el archivo esté dentro de `/docker-entrypoint-initdb.d`
- que el volumen no tenga datos previos

Si ya habías levantado el stack:

```bash
docker compose down -v
docker compose up --build
```

### LM Studio falla desde el backend

Comprueba que el backend pueda alcanzar el host:

- `host.docker.internal:1234`

Si LM Studio no está activo, el endpoint `/api/chat` devolverá error de disponibilidad.

---

## 14) Flujo recomendado de trabajo

1. Ajustar `.env`
2. Corregir la ruta de scripts de PostgreSQL
3. Levantar el stack con `docker compose up --build`
4. Probar `http://localhost:9000/health`
5. Abrir el frontend en `http://localhost`
6. Ejecutar scripts SQL extra si necesitas la estructura industrial completa
7. Revisar logs si algo falla

---

## 15) Resumen corto

```bash
docker compose up --build
```

Luego:

- frontend: `http://localhost`
- backend: `http://localhost:9000`
- health: `http://localhost:9000/health`

Si necesitas reiniciar todo desde cero:

```bash
docker compose down -v
docker compose up --build
