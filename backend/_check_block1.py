import requests

BASE = "http://localhost:8001"

def g(url, params=None):
    r = requests.get(url, params=params, timeout=10)
    print("GET", url, "->", r.status_code, (r.text[:120]).replace("\n"," "))
    return r

def p(url, payload=None):
    r = requests.post(url, json=payload or {}, timeout=10)
    print("POST", url, "->", r.status_code, (r.text[:120]).replace("\n"," "))
    return r

g(f"{BASE}/api/maquinas")
g(f"{BASE}/api/usuarios")

# ot_id de prueba: si no existe, debe devolver 500/empty pero NO 404 de ruta
g(f"{BASE}/api/ot-repuestos", params={"ot_id": 1})
g(f"{BASE}/api/ot-audit-logs", params={"ot_id": 1})
