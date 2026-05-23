import requests

BASE="http://localhost:8001"

def show(method, url, **kwargs):
    r = requests.request(method, url, timeout=10, **kwargs)
    print(method, url, "->", r.status_code, r.text[:190].replace("\n"," "))
    return r

found = None
for ot_id in range(1,51):
    r = requests.get(f"{BASE}/api/work-orders/{ot_id}", timeout=10)
    if r.status_code == 200:
        found = ot_id
        print("FOUND ot_id:", ot_id)
        break
    # else:
    #     print("TRY ot_id", ot_id, "->", r.status_code)

if not found:
    print("No ot_id found in range 1..50. Skipping PUT/DELETE smoke test.")
    raise SystemExit(0)

# Update
show("PUT", f"{BASE}/api/work-orders/{found}", json={"status":"pending","priority":"medium"})

# Fetch after update
show("GET", f"{BASE}/api/work-orders/{found}")

# Delete
show("DELETE", f"{BASE}/api/work-orders/{found}")
