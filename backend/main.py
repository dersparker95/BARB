from __future__ import annotations

# pysqlite3 shim — debe ir antes de cualquier import de chromadb
try:
    __import__("pysqlite3")
    import sys as _sys
    _sys.modules["sqlite3"] = _sys.modules.pop("pysqlite3")
except ImportError:
    pass

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor

from config import DATABASE_URL, DEEPSEEK_API_KEY, BARB_SYSTEM_PROMPT
from database import get_db_connection, release_db_connection
from utils import hash_password, ensure_passwords_hashed

# --- Routers ---
from routers import health, auth, users, catalog, topology, stats, work_orders, documents, chat

# --- App ---
app = FastAPI(title="BARB Plant Memory API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://barb-7jfguz636-tvasquezms-projects.vercel.app",
        "https://barb-rose.vercel.app",
    ],
    allow_origin_regex=r"https://barb.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Permisos (necesita app ya creada) ---
from permisos import require_route, require_action, require_auth, get_sesion_actual  # noqa: E402

# --- Registrar routers ---
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(catalog.router)
app.include_router(topology.router)
app.include_router(stats.router)
app.include_router(work_orders.router)
app.include_router(documents.router)
app.include_router(chat.router)


@app.on_event("startup")
async def startup_checks():
    if not DEEPSEEK_API_KEY:
        print("⚠️ ADVERTENCIA: DEEPSEEK_API_KEY no configurada.")

    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'usuario'
                );
            """)
            db_exists = cursor.fetchone()['exists']

            if not db_exists:
                print("⚙️ Base de datos vacía detectada. Buscando archivo SQL...")
                base_dir = os.path.dirname(__file__)
                sql_file_path = os.path.join(base_dir, 'initScripts', '01_tablas.sql')

                if os.path.exists(sql_file_path):
                    with open(sql_file_path, 'r', encoding='utf-8') as file:
                        sql_script = file.read()
                    cursor.execute(sql_script)
                    conn.commit()
                    print("✅ Tablas y datos inyectados exitosamente.")

                    cursor.execute("SELECT COUNT(*) as total FROM usuario")
                    row = cursor.fetchone()
                    if row and row['total'] == 0:
                        default_hash = hash_password('admin123')
                        cursor.execute(
                            "INSERT INTO usuario (empresa_id, nombre, email, password_hash, rol) VALUES (%s, %s, %s, %s, %s)",
                            (1, 'Admin BARB', 'admin@barb.com', default_hash, 'admin')
                        )
                        conn.commit()
                        print("✅ Usuario Administrador creado.")
                else:
                    print(f"⚠️ ERROR: No se encontró {sql_file_path}")
            else:
                print("✅ BD ya estructurada.")

            actualizados = ensure_passwords_hashed(cursor)
            conn.commit()
            if actualizados:
                print(f"🔒 {actualizados} contraseña(s) hasheadas.")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sesion (
                    token       VARCHAR(64) PRIMARY KEY,
                    usuario_id  INTEGER NOT NULL REFERENCES usuario(usuario_id) ON DELETE CASCADE,
                    creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
                    expira_en   TIMESTAMP NOT NULL
                );
            """)
            conn.commit()

            cursor.execute("ALTER TABLE usuario ADD COLUMN IF NOT EXISTS preferencias JSONB DEFAULT '{}'::jsonb;")
            conn.commit()

            cursor.execute("DELETE FROM sesion WHERE expira_en < NOW();")
            eliminadas = cursor.rowcount
            conn.commit()
            if eliminadas:
                print(f"🧹 {eliminadas} sesión(es) expirada(s) eliminadas.")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"⚠️ ADVERTENCIA: No se pudo estructurar PostgreSQL al iniciar: {e}")
    finally:
        if conn:
            release_db_connection(conn)


@app.on_event("shutdown")
async def shutdown_cleanup():
    from routers.chat import ia_client
    await ia_client.close()


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 9000))
    uvicorn.run("main_modular:app", host="0.0.0.0", port=port)
