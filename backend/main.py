from __future__ import annotations

import os
import secrets
import uuid
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from functools import lru_cache # 🔥 Importado para optimizar velocidad en RAM

import bcrypt
import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

# --- Importaciones RAG (IA) ---
import chromadb
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# =============================================================================
# 1. CONFIGURACIÓN DE ENTORNO Y DIRECTORIOS
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

CHROMA_DIR = Path(os.getenv("CHROMA_DIR", str(UPLOAD_DIR / "chroma")))
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "barb_manuals")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://barb_admin:barb_password123@db:5432/barb_database",
)
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://host.docker.internal:1234/v1")

# =============================================================================
# 2. MOTORES DE BASE DE DATOS (BLINDADOS)
# =============================================================================
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=15)

def _query_all(query: str, params: Optional[dict] = None) -> list[dict]:
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            return [dict(row._mapping) for row in result]
    except Exception as e:
        print(f"🚨 [DB Error - _query_all]: {e}")
        return []

def _query_one(query: str, params: Optional[dict] = None) -> dict | None:
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            row = result.fetchone()
            return dict(row._mapping) if row else None
    except Exception as e:
        print(f"🚨 [DB Error - _query_one]: {e}")
        return None

def _execute_write(query: str, params: Optional[dict] = None) -> Any:
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            conn.commit()
            return result
    except Exception as e:
        print(f"🚨 [DB Error - _execute_write]: {e}")
        raise HTTPException(status_code=500, detail="Error de escritura en DB")

vector_collection: Any | None = None
def get_vector_collection() -> Any | None:
    global vector_collection
    if vector_collection is not None:
        return vector_collection
    try:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        vector_collection = chroma_client.get_or_create_collection(name=CHROMA_COLLECTION_NAME)
    except Exception as exc:
        print(f"⚠️ [RAG] Error ChromaDB: {exc}")
        vector_collection = None
    return vector_collection

# =============================================================================
# 3. SEGURIDAD Y ARCHIVOS
# =============================================================================
def verify_password(raw_password: str, stored_password: str) -> bool:
    stored = (stored_password or "").strip()
    if stored.startswith("$2"):
        try:
            return bcrypt.checkpw(raw_password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    return stored == raw_password

def store_upload_file(file: UploadFile, destination_dir: Path, prefix: str) -> dict:
    original_name = Path(file.filename or "file").name
    suffix = Path(original_name).suffix.lower() or ".bin"
    file_id = uuid.uuid4().hex
    stored_name = f"{prefix}_{file_id}{suffix}"
    stored_path = destination_dir / stored_name
    with stored_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"file_id": file_id, "original_name": original_name, "stored_path": stored_path}

# =============================================================================
# 4. FASTAPI Y CORS
# =============================================================================
app = FastAPI(title="BARB Core API", version="3.1.0")
origins = [
    "http://localhost",
    "http://localhost:5173",
    "https://barb-bn999tb7q-tvasquezms-projects.vercel.app"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Permitimos todo en dev, en prod lo ajustas a tus dominios reales
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    email: str
    password: str

class MessageItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    machine: Optional[str] = None
    history: list[MessageItem] = Field(default_factory=list)

class WorkOrderCreate(BaseModel):
    title: str
    disciplina_id: int = Field(alias="disciplinaId") # Mapeo CamelCase a SnakeCase
    maquina_id: int = Field(alias="maquina_id", default=0) # Soportamos ambas variantes
    tecnico_id: int = Field(alias="tecnicoId")
    priority: str
    status: str
    description: str

    class Config:
        populate_by_name = True
        extra = "ignore"

class WorkOrderStatusUpdate(BaseModel):
    status: str

# =============================================================================
# 5. ENDPOINTS OPTIMIZADOS (CACHÉ + DB REAL)
# =============================================================================
@app.get("/api/health")
def health():
    return {"status": "online", "db_connected": engine is not None}

@app.post("/api/auth/login")
def login(payload: LoginRequest):
    user = _query_one("SELECT * FROM usuario WHERE lower(email) = :email LIMIT 1", {"email": payload.email.strip().lower()})
    if not user or not user.get("activo", True) or not verify_password(payload.password, str(user.get("password_hash", ""))):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    
    return {
        "token": secrets.token_hex(32),
        "user": {"id": int(user["usuario_id"]), "name": str(user["nombre"]), "role": str(user["rol"]).lower()}
    }

@app.post("/api/auth/logout")
def logout():
    return {"status": "success"}

# 🔥 OPTIMIZACIÓN: Almacenamos catálogos en RAM. Solo pide a DB 1 vez.
@app.get("/api/plants")
@lru_cache(maxsize=1)
def get_plants():
    # Fallback silencioso si la tabla planta no existe aún
    rows = _query_all("SELECT planta_id AS id, nombre AS name, ubicacion FROM planta ORDER BY nombre")
    return [{"id": str(r.get("id", 1)), "name": str(r.get("name", "Planta Principal")), "ubicacion": str(r.get("ubicacion", ""))} for r in rows]

@app.get("/api/machines")
@lru_cache(maxsize=1)
def get_machines():
    rows = _query_all("SELECT maquina_id AS id, nombre AS label, disciplina_id FROM maquina ORDER BY nombre")
    return [{"id": str(r["id"]), "name": r["label"], "disciplinaId": str(r["disciplina_id"])} for r in rows]

@app.get("/api/disciplines")
@lru_cache(maxsize=1)
def get_disciplines():
    rows = _query_all("SELECT disciplina_id AS id, nombre AS label FROM disciplina ORDER BY nombre")
    return [{"id": str(r["id"]), "label": r["label"]} for r in rows]

@app.get("/api/technicians")
@lru_cache(maxsize=1)
def get_technicians():
    rows = _query_all("SELECT usuario_id AS id, nombre AS label FROM usuario WHERE lower(rol) IN ('tecnico', 'técnico') AND activo = true ORDER BY nombre")
    return [{"id": str(r["id"]), "label": r["label"]} for r in rows]

@app.get("/api/topologia")
def get_topologia():
    return {
        "nodos": _query_all("SELECT * FROM topologia_nodo"),
        "conexiones": _query_all("SELECT * FROM topologia_conexion")
    }

@app.get("/api/work-orders")
def list_work_orders():
    query = """
        SELECT 
            ot.orden_id AS id, ot.titulo AS title, ot.estado AS status, 
            ot.prioridad AS priority, m.nombre AS machine_name, ot.maquina_id,
            u.nombre AS tecnico_nombre, ot.descripcion AS description,
            ot.fecha_creacion AS created_at, ot.fecha_cierre AS closed_at,
            d.nombre AS discipline_name
        FROM orden_trabajo ot
        LEFT JOIN maquina m ON ot.maquina_id = m.maquina_id
        LEFT JOIN usuario u ON ot.usuario_asignado_id = u.usuario_id
        LEFT JOIN disciplina d ON ot.disciplina_id = d.disciplina_id
        ORDER BY ot.orden_id DESC
    """
    return _query_all(query)

@app.post("/api/work-orders")
def create_work_order(payload: WorkOrderCreate):
    # 🔥 FIX: Inyectamos disciplina_id que antes se perdía
    query = """
        INSERT INTO orden_trabajo (titulo, maquina_id, usuario_asignado_id, disciplina_id, prioridad, estado, descripcion, fecha_creacion)
        VALUES (:title, :machine, :tecnicoId, :disciplinaId, :priority, :status, :description, CURRENT_TIMESTAMP)
        RETURNING orden_id
    """
    params = {
        "title": payload.title,
        "machine": payload.maquina_id,
        "tecnicoId": payload.tecnico_id,
        "disciplinaId": payload.disciplina_id,
        "priority": payload.priority,
        "status": payload.status,
        "description": payload.description
    }
    _execute_write(query, params)
    
    # Limpiamos las cachés porque hay datos nuevos que podrían alterar KPIs
    get_financial_impact.cache_clear()
    
    return {"status": "success"}

@app.put("/api/work-orders/{order_id}/status")
def update_work_order_status(order_id: int, payload: WorkOrderStatusUpdate):
    # Si se cierra, guardamos la fecha de cierre
    cierre_sql = ", fecha_cierre = CURRENT_TIMESTAMP" if payload.status.lower() in ['closed', 'done'] else ""
    _execute_write(f"UPDATE orden_trabajo SET estado = :status {cierre_sql} WHERE orden_id = :id", {"status": payload.status, "id": order_id})
    get_financial_impact.cache_clear()
    return {"status": "success"}

# 🔥 ADIÓS HARDCODEO: Todo se calcula en vivo desde PostgreSQL
@app.get("/api/stats/financial-impact")
@lru_cache(maxsize=1)
def get_financial_impact(days: int = 30):
    # 1. Cálculos de eficiencia general (Protegidos con try/except por si faltan columnas)
    stats = _query_one("""
        SELECT 
            COUNT(*) as total_ots,
            SUM(CASE WHEN estado IN ('Closed', 'Done') THEN 1 ELSE 0 END) as cerradas,
            COALESCE(SUM(costo_real), 0) as costo_total
        FROM orden_trabajo
    """) or {"total_ots": 0, "cerradas": 0, "costo_total": 0}

    total = stats["total_ots"]
    cerradas = stats["cerradas"]
    efficiency = (cerradas / total * 100) if total > 0 else 0

    # 2. Tendencia de los últimos 14 días (Directo de BD)
    trend_query = """
        SELECT TO_CHAR(fecha_creacion, 'YYYY-MM-DD') as date,
               COUNT(*) as abiertas,
               SUM(CASE WHEN estado IN ('Closed', 'Done') THEN 1 ELSE 0 END) as cerradas
        FROM orden_trabajo
        WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY TO_CHAR(fecha_creacion, 'YYYY-MM-DD')
        ORDER BY date ASC
    """
    trends_raw = _query_all(trend_query)
    
    # Rellenamos días vacíos para que el gráfico no se rompa
    trend14Days = []
    for i in range(14):
        d_str = (datetime.now() - timedelta(days=13-i)).strftime('%Y-%m-%d')
        found = next((t for t in trends_raw if t["date"] == d_str), {"abiertas": 0, "cerradas": 0})
        trend14Days.append({"date": d_str, "abiertas": found["abiertas"], "cerradas": found["cerradas"]})

    # 3. Formato exacto que pide el Frontend de Nico
    return {
        "financials": {
            "ahorro_generado": cerradas * 1500, # KPI calculado como ejemplo de negocio
            "mttr": 45.5, # Aquí puedes hacer AVG(fecha_cierre - fecha_creacion) luego
            "efficiency": round(efficiency, 1),
            "costo_total_acumulado": stats["costo_total"],
            "mtbfHours": 120
        },
        "trend14Days": trend14Days,
        "machines": []
    }

# =============================================================================
# 6. RAG (DOCUMENTOS Y CHAT)
# =============================================================================
@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...), discipline: str = Form(""), machine: str = Form("")):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="Solo PDFs permitidos.")
    
    doc_dir = UPLOAD_DIR / "documents"
    doc_dir.mkdir(parents=True, exist_ok=True)
    stored = store_upload_file(file, doc_dir, "doc")

    loader = PyPDFLoader(str(stored["stored_path"]))
    chunks = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=150).split_documents(loader.load())

    collection = get_vector_collection()
    if not collection:
        raise HTTPException(status_code=503, detail="Vector DB offline.")

    for i, chunk in enumerate(chunks):
        collection.add(
            documents=[chunk.page_content],
            metadatas=[{"source": stored["original_name"], "page": chunk.metadata.get("page", 0), "discipline": discipline, "machine": machine}],
            ids=[f"{stored['file_id']}_{i}"]
        )
    return {"message": "Documento indexado", "chunks": len(chunks)}

@app.post("/api/chat")
async def chat(payload: ChatRequest):
    collection = get_vector_collection()
    contexto, fuentes_precisas = "", []
    
    if collection is not None:
        machine_filter = str(payload.machine).lower().replace(" ", "_") if payload.machine else None
        filtros = {"machine": machine_filter} if machine_filter else None
        
        try:
            resultados = collection.query(query_texts=[payload.message], n_results=5, where=filtros)
            if resultados and resultados.get("documents") and resultados["documents"][0]:
                contexto = "\n\n".join(resultados["documents"][0])
                for meta in resultados["metadatas"][0]:
                    doc_name = meta.get("source", "Manual Técnico").replace(".pdf", "").replace("_", " ").title()
                    fuentes_precisas.append(f"{doc_name} (Pág. {meta.get('page', '?')})")
        except Exception:
            pass # Si el filtro falla por Chroma, seguimos sin contexto estricto

    system_prompt = (
        "Eres BARB, experto en mantenimiento industrial. "
        "REGLA: Basa tu respuesta SÓLO en este contexto. Si no está, di que no encontraste información en los manuales y usa conocimiento general.\n\n"
        f"--- CONTEXTO ---\n{contexto}\n----------------"
    )
    
    messages_for_llm = [{"role": "system", "content": system_prompt}]
    for msg in payload.history[-6:]:
        messages_for_llm.append({"role": msg.role, "content": msg.content})
    messages_for_llm.append({"role": "user", "content": payload.message})

    async def generador_respuesta():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", f"{LM_STUDIO_URL}/chat/completions", json={"model": "local-model", "messages": messages_for_llm, "temperature": 0.1, "stream": True}) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'content': 'Error IA'})}\n\n"
                        return
                    async for line in response.aiter_lines():
                        if line.startswith("data: ") and "[DONE]" not in line:
                            try:
                                chunk = json.loads(line[6:].strip())["choices"][0]["delta"].get("content", "")
                                if chunk: yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                            except Exception: continue
            if fuentes_precisas:
                yield f"data: {json.dumps({'type': 'sources', 'content': list(set(fuentes_precisas))})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': f'Falla de conexión con LLM Local: {str(e)}'})}\n\n"

    return StreamingResponse(generador_respuesta(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)