import requests
r1 = requests.post("http://localhost:8001/api/auth/login", json={"email":"tecnico@barb.com"}, timeout=10)
r2 = requests.post("http://localhost:8001/auth/login", json={"email":"tecnico@barb.com"}, timeout=10)
print("api/auth/login", r1.status_code, r1.text[:120].replace("\n"," "))
print("auth/login", r2.status_code, r2.text[:120].replace("\n"," "))
