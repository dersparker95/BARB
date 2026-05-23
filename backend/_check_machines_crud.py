import requests

BASE="http://localhost:8001"

def show(method, url, **kwargs):
    r = requests.request(method, url, timeout=10, **kwargs)
    print(method, url, "->", r.status_code, r.text[:140].replace("\n"," "))
    return r

# GET list
r = show("GET", f"{BASE}/api/maquinas")
machines = r.json() if r.status_code==200 else []
machine_id = machines[0]["maquina_id"] if machines else 1

# GET by id
show("GET", f"{BASE}/api/maquinas/{machine_id}")

# PUT update (cambia nombre)
show("PUT", f"{BASE}/api/maquinas/{machine_id}", json={"nombre":"Machine CRUD Updated"})

# DELETE
show("DELETE", f"{BASE}/api/maquinas/{machine_id}")
