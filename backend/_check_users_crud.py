import requests

BASE="http://localhost:8001"

def show(method, url, **kwargs):
    r = requests.request(method, url, timeout=10, **kwargs)
    print(method, url, "->", r.status_code, r.text[:160].replace("\n"," "))
    return r

# GET list
r = show("GET", f"{BASE}/api/usuarios")
users = r.json() if r.status_code==200 else []
user_id = users[0]["usuario_id"] if users else 1

# GET by id
show("GET", f"{BASE}/api/usuarios/{user_id}")

# POST create (si quieres; pero si INSERT falla por email unique, lo ignoramos)
payload = {"nombre":"User CRUD Test","email":"user_crud_test@barb.com","rol":"tecnico"}
r = show("POST", f"{BASE}/api/usuarios", json=payload)
created = r.json() if r.status_code in (200,201) else None
created_id = created["usuario_id"] if created and "usuario_id" in created else user_id

# PUT update
show("PUT", f"{BASE}/api/usuarios/{created_id}", json={"nombre":"User CRUD Updated"})

# DELETE
show("DELETE", f"{BASE}/api/usuarios/{created_id}")
