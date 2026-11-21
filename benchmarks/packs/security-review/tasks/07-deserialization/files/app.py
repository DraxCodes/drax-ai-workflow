from flask import Flask, request
import pickle
import yaml
import json

app = Flask(__name__)

@app.post("/import/session")
def import_session():
    data = pickle.loads(request.data)
    return {"user": data.get("user"), "roles": data.get("roles", [])}

@app.post("/import/config")
def import_config():
    data = yaml.load(request.data, Loader=yaml.Loader)
    return {"theme": data.get("theme", "light")}

@app.post("/import/meta")
def import_meta():
    data = json.loads(request.data)
    return {"version": data.get("version")}

if __name__ == "__main__":
    app.run(port=3000)