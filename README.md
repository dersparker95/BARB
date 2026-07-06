# 🛠️ BARB — Industrial Maintenance & Predictive AI Platform

**BARB** es un MVP de grado empresarial diseñado para la gestión de mantenimiento industrial, monitoreo topológico de plantas y diagnóstico predictivo. El sistema integra un motor **RAG (Retrieval-Augmented Generation)** impulsado por IA para asistir a técnicos interactuando con manuales, telemetría y el historial de Órdenes de Trabajo (OTs).

![Status](https://img.shields.io/badge/status-MVP-orange)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688)
![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite-61DAFB)
![DB](https://img.shields.io/badge/database-PostgreSQL%2015-336791)
![License](https://img.shields.io/badge/license-Privado-lightgrey)

---

## 📋 Tabla de contenidos

1. [Arquitectura del sistema](#-arquitectura-del-sistema)
2. [Estructura del proyecto](#-estructura-del-proyecto)
3. [Configuración del entorno](#-configuración-del-entorno-variables)
4. [Guía de inicialización](#-guía-de-inicialización-local-development)
5. [Bootstrapping de base de datos](#-bootstrapping-de-base-de-datos-auto-seeding)
6. [Estándares de código y arquitectura](#-estándares-de-código-y-patrones-de-arquitectura)
7. [Mantenimiento y operaciones (DevOps)](#-mantenimiento-y-operaciones-devops)
8. [Enlaces útiles](#-enlaces-útiles)

---

## 🏗️ Arquitectura del sistema

El proyecto sigue una arquitectura desacoplada orientada a microservicios, con despliegue en la nube (Serverless/PaaS).

| Capa | Tecnología | Descripción | Despliegue |
|---|---|---|---|
| **Frontend** | React 18 + Vite | SPA compilada, estilizada con Tailwind CSS | Vercel |
| **Backend** | Python 3.10+ / FastAPI | API RESTful asíncrona. Autenticación, RAG y lógica de negocio | Render |
| **Persistencia** | PostgreSQL 15+ | Base de datos relacional multi-tenant. Sesiones con expiración (TTL) | — |
| **Motor AI** | DeepSeek API | Procesamiento LLM para el DocChat y Debug predictivo | — |

---

## 🗂️ Estructura del proyecto

```
BARB/
├── docker-compose.yml         # Orquestación de contenedores (Frontend, Backend, Postgres).
├── .env                       # Variables de entorno globales (Credenciales, URLs, Keys).
├── README.md                  # Documentación principal y guía de onboarding.
│
├── initScripts/               # 🗄️ AUTO-SEEDING Y BASE DE DATOS
│   └── 01_tablas.sql          # Script principal. Borra y recrea el esquema público, inyecta tablas, roles, OTs y credenciales de prueba.
│
├── backend/                   # ⚙️ CAPA DE SERVIDOR (FastAPI + Python)
│   ├── main.py                # Punto de entrada de la API. Gestiona el arranque, conexión a DB, auto-sanación (seeding) y limpieza de sesiones.
│   ├── permisos.py            # Motor de RBAC (Control de Acceso Basado en Roles). Valida tokens y protege rutas/acciones.
│   ├── requirements.txt       # Dependencias de Python (FastAPI, psycopg2, dependencias de IA, etc.).
│   └── Dockerfile             # Instrucciones para empaquetar el backend en Render/Docker.
│
└── frontend/                  # 💻 CAPA DE CLIENTE (React + Vite + Tailwind)
    ├── package.json           # Dependencias de Node y scripts de ejecución (dev, build).
    ├── Dockerfile              # Empaquetado multietapa (Node + Nginx) para despliegue.
    └── src/
        ├── App.tsx            # Componente raíz. Maneja el enrutamiento (React Router) y la protección de rutas.
        ├── main.tsx           # Punto de montaje de React en el DOM.
        │
        ├── context/           # 🧠 ESTADO GLOBAL
        │   └── AppContext.tsx # Proveedor principal. Inyecta el usuario, idioma, tema oscuro y la instancia segura de la API.
        │
        ├── services/          # 🔌 COMUNICACIÓN Y LÓGICA DE NEGOCIO
        │   ├── api.ts         # ¡ARCHIVO CRÍTICO! Wrapper de fetch. Intercepta errores 401 e inyecta el token Bearer en todas las llamadas.
        │   └── workOrders.ts  # Funciones puras de lógica de negocio (Cálculo de MTTR, filtros, estados).
        │
        ├── pages/             # 🖥️ VISTAS PRINCIPALES
        │   ├── Login.tsx      # Autenticación de usuarios.
        │   ├── Menu.tsx       # Hub central y subida de documentos técnicos.
        │   ├── DocChat.tsx    # Interfaz del asistente IA documental (RAG) con soporte multimodal.
        │   ├── Debug.tsx      # Consola de diagnóstico predictivo basado en el historial de fallas.
        │   ├── Topology.tsx   # Mapa interactivo de la planta (nodos, conexiones y salud de equipos).
        │   └── Dashboard/     # Paneles de métricas (FinancialDashboard, listado de OTs).
        │
        ├── components/        # 🧩 PIEZAS REUTILIZABLES DE UI
        │   ├── ChatBubble.tsx # Renderiza mensajes del usuario y de la IA.
        │   ├── Modals/        # Modales de sistema (SettingsModal, HelpModal, WorkOrderCreateModal).
        │   └── Spinner.tsx    # Indicadores de carga compartidos.
        │
        └── utils/             # 🛠️ HERRAMIENTAS DE SOPORTE
            ├── permissions.ts # Matriz de permisos del frontend (espejo de permisos.py). Define quién ve cada botón o página.
            ├── i18n.ts        # Diccionarios de internacionalización (ES/EN).
            └── rag.ts         # Funciones auxiliares para el procesamiento de texto en el cliente.
```

---

## ⚙️ Configuración del entorno (variables)

Antes de levantar el proyecto, debes configurar las variables de entorno. Crea los archivos `.env` en sus respectivas carpetas:

### 1. Frontend — `/frontend/.env`

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_API_URL` | Endpoint raíz del backend | Local: `http://localhost:9000/api` · Prod: `https://api-barb.render.com/api` |

### 2. Backend — `/backend/.env`

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://user:pass@host/barb_db` |
| `DEEPSEEK_API_KEY` | Credencial segura para el LLM | `sk-xxxxxxxxxxxxxxxxxxxxxxxx` |

> ⚠️ **Advertencia de seguridad**: Nunca hagas commit de los archivos `.env`. El `DEEPSEEK_API_KEY` debe inyectarse directamente en el dashboard del proveedor cloud (Render/Vercel), nunca en el repositorio.

---

## 🚀 Guía de inicialización (local development)

### Opción A — Contenedores (Docker) · Recomendado

El proyecto incluye un `docker-compose.yml` preparado para levantar todo el stack de forma aislada.

```bash
docker compose up --build -d
docker compose logs -f backend
```

### Opción B — Ejecución nativa (bare-metal)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 9000 --reload
```

**Frontend** (en otra terminal):
```bash
cd frontend
npm install
npm run dev
```

---

## 🗄️ Bootstrapping de base de datos (auto-seeding)

Para facilitar el desarrollo y los despliegues efímeros, BARB incluye un sistema de auto-sanación estructural en su startup (`main.py`):

1. **Detección automática** — Al iniciar, FastAPI verifica si la tabla `usuario` existe en PostgreSQL.
2. **Inyección de seed** — Si la BD está vacía, lee automáticamente el archivo `./initScripts/01_tablas.sql` e inyecta toda la estructura y datos de prueba.
3. **Seguridad de credenciales** — Las contraseñas en texto plano presentes en el archivo SQL son encriptadas sobre la marcha mediante `hash_password` antes de permitir el inicio de sesión.

---

## 📐 Estándares de código y patrones de arquitectura

### 1. Gestión de peticiones y seguridad (API Wrapper)

🚫 **Prohibido** el uso de `fetch()` crudo en componentes React. Toda comunicación con el backend debe realizarse a través del servicio inyectado por contexto (`services/api.ts`). Esto garantiza que:

- El header `Authorization: Bearer <token>` viaje siempre en cada llamada.
- Los errores globales (como sesión expirada) intercepten la app y fuercen el logout automático.

### 2. Autenticación y autorización

- **Backend**: BARB no utiliza JWT sin estado. Se utiliza un enfoque seguro basado en base de datos — cada login genera un token guardado en la tabla `sesion` con un TTL de 24 horas.
- **Permisos**: Protegidos a nivel de endpoint mediante inyección de dependencias en FastAPI (`permisos.py`) y reflejados en el frontend mediante la matriz de accesos en `utils/permissions.ts`.

---

## 🔧 Mantenimiento y operaciones (DevOps)

### Limpieza de sesiones

El backend incluye una tarea de recolección de basura en el evento de inicio. Cada vez que el servidor se reinicia, ejecuta un barrido:

```sql
DELETE FROM sesion WHERE expira_en < NOW();
```

### Hard-reset de base de datos

Si los datos de QA se corrompen y necesitas restaurar la planta "Demo" de fábrica:

1. Asegúrate de estar autenticado en el sistema como **Admin**.
2. Llama al endpoint de rescate mediante un `GET` request a `/api/force-reset-db`.
3. Esto aplicará un `DROP SCHEMA public CASCADE`, reconstruirá las tablas y reinicializará los usuarios de prueba.

> ⚠️ Esta operación es **destructiva e irreversible**. Úsala únicamente en entornos de QA/Demo, nunca en producción.

---

## 🔗 Enlaces útiles

- [Documentación de FastAPI](https://fastapi.tiangolo.com/)
- [Vite Configuration](https://vitejs.dev/config/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)