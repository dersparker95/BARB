from __future__ import annotations

import os
import secrets  # <-- Nueva librería para seguridad profesional
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import json
from fastapi.responses import StreamingResponse
import bcrypt
import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor
from sqlalchemy import create_engine, text

# --- Importaciones RAG (IA) ---
import chromadb
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

# -----------------------------------------------------------------------------
# 1. Configuración Profesional de Entorno y Directorios (Sin Hardcodeo)
# -----------------------------------------------------------------------------
# Descubre la ruta absoluta del backend para no crear carpetas clonadas
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

CHROMA_DIR = Path(os.getenv("CHROMA_DIR", str(UPLOAD_DIR / "chroma")))
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "barb_manuals")
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://host.docker.internal:1234/v1")

# Inicialización segura de ChromaDB
vector_collection: Any | None = None
def get_vector_collection() -> Any | None:
    global vector_collection
    if vector_collection is not None:
        return vector_collection
    try:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        vector_collection = chroma_client.get_or_create_collection(name=CHROMA_COLLECTION_NAME)
        print("✅ ChromaDB conectado exitosamente")
    except Exception as exc:
        print(f"[RAG] Error crítico - No se pudo inicializar ChromaDB: {exc}")
        vector_collection = None
    return vector_collection

# -----------------------------------------------------------------------------
# 2. Configuración de API Unificada
# -----------------------------------------------------------------------------
app = FastAPI(title="BARB Unified API - Nivel Producción")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción reemplazar con orígenes exactos
    allow_origin_regex=r"https://barb-.*\.vercel\.app", 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [AQUÍ DEBES ASEGURARTE DE TENER TUS FUNCIONES DE BD: engine, get_db_connection, _query_one, etc.]

# --- Modelos Pydantic ---
class LoginRequest(BaseModel):
    email: str
    password: str

class MessageItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    machine: Optional[str] = None
    language: str = Field(default="es")
    # Nueva mejora: Soporte para memoria conversacional
    history: list[MessageItem] = Field(default_factory=list)

class UserCreateRequest(BaseModel):
    nombre: str
    email: str
    password: str
    rol: str
    activo: bool = True

# -----------------------------------------------------------------------------
# 3. Autenticación Segura (Mejora: Tokens Dinámicos)
# -----------------------------------------------------------------------------
@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email y contraseña requeridos.")

    user = _query_one(
        """
        SELECT usuario_id, nombre, email, password_hash, rol, activo
        FROM usuario
        WHERE lower(email) = lower(%(email)s)
        LIMIT 1
        """,
        {"email": email},
    )

    if not user or not user.get("activo", True):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrecta")

    if not verify_password(password, str(user.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrecta")

    # MEJORA PROFESIONAL: Generar un token criptográfico real en lugar de "barb-token"
    secure_session_token = secrets.token_hex(32)

    return {
        "token": secure_session_token,
        "user": {
            "id": int(user["usuario_id"]),
            "name": str(user["nombre"]),
            "role": str(user["rol"]).lower(),
        },
    }

@app.post("/api/auth/logout")
async def logout():
    return {"status": "success"}

# -----------------------------------------------------------------------------
# 4. RAG y Motor de IA (Mejora: Consulta Dinámica a BD)
# -----------------------------------------------------------------------------
@app.post("/api/chat")
async def chat(payload: ChatRequest):
    collection = get_vector_collection()
    resultados = None
    machine_filter = None
    
    if collection is not None:
        id_maquina = str(payload.machine).strip() if payload.machine else ""
        if id_maquina and id_maquina.isdigit():
            try:
                with engine.connect() as conn:
                    result = conn.execute(
                        text("SELECT nombre FROM maquina WHERE maquina_id = :id"),
                        {"id": int(id_maquina)}
                    ).fetchone()
                    if result:
                        machine_filter = result[0].lower().replace(" ", "_")
            except Exception as e:
                print(f"[RAG] Error buscando máquina dinámica: {e}")
        elif id_maquina:
            machine_filter = id_maquina.lower().replace(" ", "_")
            
        filtros = {"machine": machine_filter} if machine_filter else None
        
        resultados = collection.query(query_texts=[payload.message], n_results=8, where=filtros)

    contexto = ""
    fuentes_precisas = []
    if resultados and resultados["documents"] and resultados["documents"][0]:
        contexto = "\n\n".join(resultados["documents"][0])
        for meta in resultados["metadatas"][0]:
            doc_name = meta.get("source", "Manual Técnico")
            page = meta.get("page", "?")
            clean_name = doc_name.replace(".pdf", "").replace("_", " ").title()
            fuentes_precisas.append(f"{clean_name} (Pág. {page})")

    system_prompt = (
        "Eres BARB, un asistente de Inteligencia Artificial experto en ingeniería y mantenimiento industrial.\n"
        "REGLAS ESTRICTAS DE SEGURIDAD:\n"
        "1. Basa tu respuesta ÚNICAMENTE en los fragmentos de manuales proporcionados abajo.\n"
        "2. Si la respuesta no está contenida en los fragmentos, NO INVENTES NADA. Responde exactamente: '⚠️ No encontré procedimientos específicos en los manuales indexados para responder a esta consulta.'\n"
        "3. Sé extremadamente preciso, técnico y conciso. Usa listas o viñetas.\n\n"
        f"--- CONTEXTO EXTRAÍDO DE LOS MANUALES ---\n{contexto}\n----------------------------------------"
    )
    
    messages_for_llm = [{"role": "system", "content": system_prompt}]
    for msg in payload.history[-6:]:
    messages_for_llm.append({"role": msg.role, "content": msg.content})
    messages_for_llm.append({"role": "user", "content": payload.message})

    # --- NUEVA LÓGICA DE STREAMING (MÁQUINA DE ESCRIBIR) ---
    async def generador_respuesta():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{LM_STUDIO_URL}/chat/completions",
                    json={
                        "model": "local-model",
                        "messages": messages_for_llm,
                        "temperature": 0.1,
                        "stream": True # ¡La magia que activa el modo tiempo real!
                    }
                ) as response:
                    
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'content': 'Error en motor IA'})}\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                data_json = json.loads(data_str)
                                chunk = data_json["choices"][0]["delta"].get("content", "")
                                if chunk:
                                    # Enviamos la palabra al instante
                                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                            except Exception:
                                continue
            
            # Al terminar de escribir, enviamos las fuentes bibliográficas
            if fuentes_precisas:
                yield f"data: {json.dumps({'type': 'sources', 'content': list(set(fuentes_precisas))})}\n\n"
                
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': f'Error conectando con la IA: {str(e)}'})}\n\n"

    return StreamingResponse(generador_respuesta(), media_type="text/event-stream")
# -----------------------------------------------------------------------------
# 5. Gestión Documental (Ingesta RAG)
# -----------------------------------------------------------------------------
@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    discipline: str = Form(""),
    machine: str = Form(""),
    notes: str = Form(""),
):
    content_type = (file.content_type or "").strip().lower()
    if content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="Solo se permiten archivos PDF.")

    doc_dir = UPLOAD_DIR / "documents"
    doc_dir.mkdir(parents=True, exist_ok=True)
    
    # Asegúrate de tener tu función store_upload_file definida en tu proyecto
    stored = store_upload_file(file, doc_dir, "doc")
    file_path = str(stored["stored_path"])

    print(f"[RAG] Iniciando procesamiento del manual: {stored['original_name']}")

    try:
        loader = PyPDFLoader(file_path)
        documentos = loader.load()

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=150)
        chunks = text_splitter.split_documents(documentos)

        collection = get_vector_collection()
        if collection is None:
            raise HTTPException(status_code=503, detail="Base vectorial inactiva.")

        for i, chunk in enumerate(chunks):
            collection.add(
                documents=[chunk.page_content],
                metadatas=[{
                    "source": stored["original_name"],
                    "page": chunk.metadata.get("page", 0),
                    "discipline": discipline,
                    "machine": machine,
                }],
                ids=[f"{stored['file_id']}_chunk_{i}"]
            )
        print(f"[RAG] ¡Éxito! {len(chunks)} fragmentos vectorizados.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando PDF: {str(e)}")

    return {"message": "Documento indexado con éxito en la IA", "chunks": len(chunks)}


# -----------------------------------------------------------------------------
# [NOTA: Añade aquí debajo tus otros endpoints (Crear OT, Listar Usuarios, etc.) 
# asegurándote de no tener duplicados al final del archivo]
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)