import requests, json

BASE="http://localhost:8001"

def show(method, url, **kwargs):
    r = requests.request(method, url, timeout=10, **kwargs)
    print(method, url, "->", r.status_code, r.text[:160].replace("\n"," "))
    return r

# GET list
r = show("GET", f"{BASE}/api/plantas")
plants = r.json() if r.status_code==200 else []
plant_id = plants[0]["planta_id"] if plants else 1

# GET by id
show("GET", f"{BASE}/api/plantas/{plant_id}")

# POST create
payload = {"nombre":"Planta Test API","ubicacion":"Ubicacion Test"}
r = show("POST", f"{BASE}/api/plantas", json=payload)
created = r.json() if r.status_code in (200,201) else None
created_id = created["planta_id"] if created and "planta_id" in created else plant_id

# PUT update
show("PUT", f"{BASE}/api/plantas/{created_id}", json={"ubicacion":"Ubicacion Actualizada"})

# DELETE
show("DELETE", f"{BASE}/api/plantas/{created_id}")
