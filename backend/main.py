from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from typing import Optional

# -----------------------------------------------------------------------------
# Configuración de aplicación Unificada
# -----------------------------------------------------------------------------
app = FastAPI(title="BARB Unified API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = "postgresql+psycopg2://barb_admin:barb_password123@db:5432/barb_database"
engine = create_engine(DATABASE_URL)

# --- 1. Endpoint de Login (Para que React te deje entrar) ---
@app.post("/api/auth/login")
async def login_mock(payload: dict = None):
    return {"token": "barb-token", "user": {"id": 1, "name": "Admin", "role": "admin"}}

# --- 2. Endpoint Financiero ---
@app.get("/api/stats/financial-impact")
def get_financial_impact():
    query = text("""
        SELECT COALESCE(AVG(tiempo_reparacion_min), 0) AS mttr,
               COALESCE(SUM(costo_real), 0) AS costo_total_acumulado,
               COALESCE(SUM(downtime_minutes), 0) * 2000 AS ahorro_estimado
        FROM orden_trabajo WHERE estado = 'completed'
    """)
    try:
        with engine.connect() as conn:
            res = conn.execute(query).mappings().one()
            return {
                "mttr": float(res["mttr"]),
                "costo_total_acumulado": float(res["costo_total_acumulado"]),
                "ahorro_estimado": float(res["ahorro_estimado"])
            }
    except:
        return {"mttr": 0.0, "costo_total_acumulado": 0.0, "ahorro_estimado": 0.0}

# --- 3. Endpoint de OTs (Con manejo seguro de NULLs) ---
@app.get("/api/work-orders")
@app.get("/api/work_orders")
def get_work_orders():
    query = text("SELECT numero_ot, estado, tiempo_reparacion_min, costo_real FROM orden_trabajo ORDER BY numero_ot DESC")
    try:
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
            resultados = []
            for r in rows:
                estado_bd = str(r.get("estado", "pending")).lower()
                estado_visual = "Closed" if "completed" in estado_bd else "In Progress"
                
                # Extracción segura: Si viene NULL de la BD, lo convertimos a 0
                costo_bd = r.get("costo_real")
                costo_seguro = float(costo_bd) if costo_bd is not None else 0.0
                
                tiempo_bd = r.get("tiempo_reparacion_min")
                tiempo_seguro = int(tiempo_bd) if tiempo_bd is not None else 0

                resultados.append({
                    "id": str(r.get("numero_ot", "000")),
                    "title": f"OT Industrial-{r.get('numero_ot')}",
                    "machine": "1", 
                    "priority": "High" if costo_seguro > 500 else "Medium",
                    "status": estado_visual,
                    "age_minutes": tiempo_seguro
                })
            return resultados
    except Exception as e:
        print(f"Error BD: {e}")
        return []

# --- 4. Catálogos Mocks (Evita que fallen los filtros del Dashboard) ---
@app.get("/api/machines")
def get_machines():
    return [{"id": 1, "name": "Planta Principal", "discipline_id": 1}]

@app.get("/api/disciplines")
def get_disciplines():
    return [{"id": 1, "name": "General"}]

# --- 5. RAG Endpoint Básico ---
@app.post("/api/chat")
async def chat(payload: dict):
    return {"reply": "Motor IA conectado.", "sources": [], "language": "es"}

# --- 6. Endpoint para CREAR OT (El único que necesitas) ---
@app.post("/api/work-orders")
async def create_ot(
    title: str = Form(...),
    disciplinaId: str = Form(...),
    machine: str = Form(...),
    tecnicoId: str = Form(...),
    priority: str = Form("Medium"),
    status: str = Form("Open"),
    description: str = Form(...),
    photo: Optional[UploadFile] = File(None)
):
    # La consulta SQL unificada para insertar
    query = text("""
        INSERT INTO orden_trabajo (estado, title, description, costo_real, tiempo_reparacion_min)
        VALUES (:estado, :title, :desc, 0, 0)
    """)
    
    try:
        with engine.begin() as conn: 
            conn.execute(query, {
                "estado": status, 
                "title": title, 
                "desc": description
            })
        return {"status": "success", "message": "OT creada correctamente"}
    except Exception as e:
        print(f"Error al insertar en BD: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- ARRANQUE DEL SERVIDOR (Siempre al final) ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)