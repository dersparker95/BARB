import requests

urls = [
    "http://localhost:8001/",
    "http://localhost:8001/health",
    "http://localhost:8001/work-orders",
    "http://localhost:8001/api/work-orders",
]

for u in urls:
    try:
        r = requests.get(u, timeout=10)
        print(u, r.status_code, r.text[:120].replace("\n"," "))
    except Exception as e:
        print(u, "ERROR", str(e))
