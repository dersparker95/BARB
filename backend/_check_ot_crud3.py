import requests

BASE="http://localhost:8001"

def show(method, url, **kwargs):
    r = requests.request(method, url, timeout=15, **kwargs)
    print(method, url, "->", r.status_code, r.text[:220].replace("\n"," "))
    return r

# pick a machine for OT creation
machines = show("GET", f"{BASE}/api/maquinas").json()
machine_code = machines[0]["codigo"]

payload = {
    "title": "OT CRUD Smoke Test v3",
    "machine": machine_code,
    "priority": "medium",
    "description": "desc",
    "status": "pending",
}

# create OT (backend returns id=numero_ot)
resp = show("POST", f"{BASE}/api/work-orders", json=payload).json()
numero_ot = resp["id"]
print("numero_ot:", numero_ot)

# resolve ot_id
ot_id_resp = show("GET", f"{BASE}/api/work-orders/by-numero-ot/{numero_ot}").json()
ot_id = ot_id_resp["ot_id"]
print("ot_id:", ot_id)

# PUT
show("PUT", f"{BASE}/api/work-orders/{ot_id}", json={"status":"assigned","priority":"high"})

# GET after update
show("GET", f"{BASE}/api/work-orders/{ot_id}")

# DELETE
show("DELETE", f"{BASE}/api/work-orders/{ot_id}")
