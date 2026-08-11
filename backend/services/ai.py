from __future__ import annotations

from pathlib import Path
from typing import Optional

from config import CHROMA_DB_PATH, CHROMA_COLLECTION_NAME

try:
    import chromadb
    _CHROMA_AVAILABLE = True
except ImportError:
    chromadb = None
    _CHROMA_AVAILABLE = False

try:
    from pypdf import PdfReader
    _PYPDF_AVAILABLE = True
except ImportError:
    PdfReader = None
    _PYPDF_AVAILABLE = False

try:
    import docx2txt
    _DOCX2TXT_AVAILABLE = True
except ImportError:
    docx2txt = None
    _DOCX2TXT_AVAILABLE = False

_chroma_client = None
_chroma_collection = None


def get_manuals_collection():
    global _chroma_client, _chroma_collection
    if not _CHROMA_AVAILABLE:
        return None
    if _chroma_collection is not None:
        return _chroma_collection
    try:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        _chroma_collection = _chroma_client.get_or_create_collection(name=CHROMA_COLLECTION_NAME)
        return _chroma_collection
    except Exception as e:
        print(f"⚠️ No se pudo inicializar Chroma en {CHROMA_DB_PATH}: {e}")
        return None


def get_manuals_corpus_version() -> int:
    collection = get_manuals_collection()
    if collection is None:
        return 0
    try:
        return collection.count()
    except Exception:
        return 0


def extract_pdf_chunks(pdf_path: Path, chunk_size: int = 1000, overlap: int = 150) -> list[dict]:
    if not _PYPDF_AVAILABLE:
        return []
    try:
        reader = PdfReader(str(pdf_path))
    except Exception as e:
        print(f"Error leyendo PDF {pdf_path.name}: {e}")
        return []

    chunks: list[dict] = []
    for page_num, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            piece = text[start:start + chunk_size].strip()
            if piece:
                chunks.append({"text": piece, "page": page_num})
            start += max(chunk_size - overlap, 1)
    return chunks


def extract_docx_chunks(docx_path: Path, chunk_size: int = 1000, overlap: int = 150) -> list[dict]:
    if not _DOCX2TXT_AVAILABLE:
        return []
    try:
        text = (docx2txt.process(str(docx_path)) or "").strip()
    except Exception as e:
        print(f"Error leyendo DOCX {docx_path.name}: {e}")
        return []

    if not text:
        return []

    chunks: list[dict] = []
    start = 0
    while start < len(text):
        piece = text[start:start + chunk_size].strip()
        if piece:
            chunks.append({"text": piece, "page": None})
        start += max(chunk_size - overlap, 1)
    return chunks


def extract_document_chunks(doc_path: Path, original_name: str) -> list[dict]:
    ext = original_name.lower().rsplit(".", 1)[-1] if "." in original_name else ""
    if ext == "pdf":
        return extract_pdf_chunks(doc_path)
    if ext == "docx":
        return extract_docx_chunks(doc_path)
    return []


def index_document_in_chroma(
    doc_path: Path, original_name: str, document_id: str,
    title: Optional[str] = None, discipline_id: Optional[int] = None, machine_id: Optional[int] = None,
) -> dict:
    if not _CHROMA_AVAILABLE:
        return {"chunks_indexed": 0, "warning": "chromadb no está instalado; archivo guardado pero no indexado."}

    collection = get_manuals_collection()
    if collection is None:
        return {"chunks_indexed": 0, "warning": "No se pudo conectar con Chroma; archivo guardado pero no indexado."}

    ext = original_name.lower().rsplit(".", 1)[-1] if "." in original_name else ""
    if ext == "pdf" and not _PYPDF_AVAILABLE:
        return {"chunks_indexed": 0, "warning": "pypdf no instalado; no se pudo extraer texto del PDF."}
    if ext == "docx" and not _DOCX2TXT_AVAILABLE:
        return {"chunks_indexed": 0, "warning": "docx2txt no instalado; no se pudo extraer texto del DOCX."}
    if ext not in ("pdf", "docx"):
        return {"chunks_indexed": 0, "warning": f"Formato .{ext or '?'} no soportado para indexación."}

    chunks = extract_document_chunks(doc_path, original_name)
    if not chunks:
        return {"chunks_indexed": 0, "warning": "No se pudo extraer texto del archivo; no se indexó."}

    base_metadata = {"source": original_name, "document_id": document_id}
    if title:
        base_metadata["title"] = title
    if discipline_id is not None:
        base_metadata["discipline_id"] = discipline_id
    if machine_id is not None:
        base_metadata["machine_id"] = machine_id

    try:
        metadatas = []
        for c in chunks:
            meta = dict(base_metadata)
            if c.get("page") is not None:
                meta["page"] = c["page"]
            metadatas.append(meta)

        collection.add(
            ids=[f"{document_id}-{i}" for i, _ in enumerate(chunks)],
            documents=[c["text"] for c in chunks],
            metadatas=metadatas,
        )
        return {"chunks_indexed": len(chunks), "warning": None}
    except Exception as e:
        print(f"Error indexando {original_name} en Chroma: {e}")
        return {"chunks_indexed": 0, "warning": f"Falló el indexado en Chroma ({type(e).__name__})."}


def query_manual_chunks(query_text: str, n_results: int = 4, machine_id: Optional[int] = None) -> list[dict]:
    collection = get_manuals_collection()
    if collection is None:
        return []

    def _run_query(where: Optional[dict]):
        count = collection.count()
        if count == 0:
            return []
        kwargs = {"query_texts": [query_text], "n_results": min(n_results, count)}
        if where:
            kwargs["where"] = where
        results = collection.query(**kwargs)
        docs = (results.get("documents") or [[]])[0]
        metas = (results.get("metadatas") or [[]])[0]
        return [
            {"text": doc, "source": meta.get("source", "manual"), "page": meta.get("page")}
            for doc, meta in zip(docs, metas)
        ]

    try:
        if machine_id is not None:
            filtered = _run_query({"machine_id": machine_id})
            if filtered:
                return filtered
        return _run_query(None)
    except Exception as e:
        print(f"Error consultando manuales en Chroma: {e}")
        return []


def fetch_recent_machine_failures(maquina_id: int, limit: int = 5) -> list[dict]:
    from database import _query_all
    try:
        return _query_all(
            """
            SELECT ot.numero_ot, ot.descripcion_problema, ot.descripcion_reparacion,
                   ot.resolution, ot.estado, ot.severity, ot.fecha_creacion, ot.fecha_cierre
            FROM orden_trabajo ot
            WHERE ot.maquina_id = %(maquina_id)s
            ORDER BY ot.fecha_creacion DESC LIMIT %(limit)s
            """,
            {"maquina_id": maquina_id, "limit": limit},
        )
    except Exception as e:
        print(f"Error consultando historial de fallas para máquina {maquina_id}: {e}")
        return []


def format_failure_history_for_prompt(rows: list[dict]) -> str:
    lines = []
    for row in rows:
        fecha = row["fecha_creacion"].strftime("%Y-%m-%d") if row.get("fecha_creacion") else "fecha N/A"
        problema = row.get("descripcion_problema") or "sin descripción registrada"
        resolucion = row.get("resolution") or row.get("descripcion_reparacion") or "sin resolución registrada"
        estado = row.get("estado") or "desconocido"
        lines.append(f"- [{fecha}] OT {row['numero_ot']}: {problema}. Estado: {estado}. Resolución: {resolucion}.")
    return "\n".join(lines)
