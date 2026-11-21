from flask import Flask, request, send_file
import subprocess
import tempfile
import os

app = Flask(__name__)
UPLOAD_DIR = "/srv/uploads"

@app.post("/convert")
def convert():
    upload = request.files["image"]
    name = upload.filename
    src = os.path.join(UPLOAD_DIR, name)
    upload.save(src)
    out = os.path.join(tempfile.gettempdir(), f"{name}.jpg")
    subprocess.run(f"convert {src} {out}", shell=True, check=True)
    return send_file(out, mimetype="image/jpeg")

@app.post("/inspect")
def inspect():
    upload = request.files["image"]
    name = upload.filename
    src = os.path.join(UPLOAD_DIR, name)
    upload.save(src)
    result = subprocess.run(["identify", src], capture_output=True, text=True, check=False)
    return {"ok": result.returncode == 0}

if __name__ == "__main__":
    app.run(port=3000)