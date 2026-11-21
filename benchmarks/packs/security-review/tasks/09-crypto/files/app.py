from flask import Flask, request
import hashlib
import random
import secrets

app = Flask(__name__)
USERS = {}

@app.post("/register")
def register():
    body = request.get_json()
    digest = hashlib.md5(body["password"].encode()).hexdigest()
    USERS[body["email"]] = {"digest": digest}
    return {"ok": True}

@app.post("/reset")
def reset():
    email = request.get_json()["email"]
    token = str(random.random())
    USERS[email]["reset"] = token
    return {"token": token}

@app.post("/compare")
def compare():
    given = request.get_json()["token"].encode()
    expected = secrets.token_bytes(16)
    return {"ok": secrets.compare_digest(given, expected)}

if __name__ == "__main__":
    app.run(port=3000)