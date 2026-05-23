import os
import psycopg2
import requests
from datetime import datetime

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://barb_admin:barb_password123@db:5432/barb_database",
)
BASE="http://localhost:8001"

def show(method, url, **kwargs):
    r = requests.request(method, url, timeout=15, **kwargs)
    print(method, url, "->", r.status_code, r.text[:200].replace("\n"," "))
    return r

# 1) Pick existing machine by code or name from GET /api/maquinas
machines = requests.get(f"{BASE}/api/maquinas", timeout=15).json()
machine = machines[0]
machine_code = machine["codigo"]
machine_name = machine["nombre"]

payload = {
    "title": "OT CRUD Smoke Test",
    "machine": machine_code,  # backend admite codigo o nombre
    "priority": "medium",
    "description": "desc",
    "status": "pending",
}
resp = show("POST", f"{BASE}/api/work-orders", json=payload)
data = resp.json()
numero_ot = data["id"]
print("numero_ot returned:", numero_ot)

# 2) Find ot_id by numero_ot
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
cur.execute("SELECT ot_id FROM ORDEN_TRABAJO WHERE numero_ot = %s;", (numero_ot,))
row = cur.fetchone()
if not row:
    raise SystemExit("Could not find ot_id for numero_ot in DB.")
ot_id = row[0]
print("ot_id resolved:", ot_id)

# 3) PUT and DELETE by ot_id
show("PUT", f"{BASE}/api/work-orders/{ot_id}", json={"status":"assigned","priority":"high"})
show("GET", f"{BASE}/api/work-orders/{ot_id}")
show("DELETE", f"{BASE}/api/work-orders/{ot_id}")
