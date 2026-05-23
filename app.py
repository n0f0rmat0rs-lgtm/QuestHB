import os
import json
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, render_template

app = Flask(__name__)

PACKS_DIR = Path("question_packs")
MEDIA_DIR = Path("media")
PACKS_DIR.mkdir(exist_ok=True)
MEDIA_DIR.mkdir(exist_ok=True)

ALLOWED_MEDIA = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"},
    "audio": {".mp3", ".ogg", ".wav", ".m4a"},
    "video": {".mp4", ".webm", ".ogg"},
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/editor")
def editor():
    return render_template("editor.html")


@app.route("/api/packs")
def list_packs():
    packs = [f.stem for f in sorted(PACKS_DIR.glob("*.json"))]
    return jsonify(packs)


@app.route("/api/packs/<name>", methods=["GET"])
def get_pack(name):
    path = PACKS_DIR / f"{name}.json"
    if not path.exists():
        return jsonify({"error": "not found"}), 404
    return jsonify(json.loads(path.read_text(encoding="utf-8")))


@app.route("/api/packs/<name>", methods=["POST"])
def save_pack(name):
    data = request.get_json()
    if data is None:
        return jsonify({"error": "invalid json"}), 400
    path = PACKS_DIR / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify({"ok": True})


@app.route("/api/packs/<name>", methods=["DELETE"])
def delete_pack(name):
    path = PACKS_DIR / f"{name}.json"
    if path.exists():
        path.unlink()
    return jsonify({"ok": True})


@app.route("/api/upload", methods=["POST"])
def upload_media():
    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400
    f = request.files["file"]
    ext = Path(f.filename).suffix.lower()
    allowed = set().union(*ALLOWED_MEDIA.values())
    if ext not in allowed:
        return jsonify({"error": "unsupported file type"}), 400
    dest = MEDIA_DIR / f.filename
    # avoid overwrite collisions
    counter = 1
    while dest.exists():
        dest = MEDIA_DIR / f"{Path(f.filename).stem}_{counter}{ext}"
        counter += 1
    f.save(dest)
    return jsonify({"path": f"media/{dest.name}"})


@app.route("/media/<path:filename>")
def serve_media(filename):
    return send_from_directory(MEDIA_DIR, filename)


if __name__ == "__main__":
    print("Открой в браузере: http://localhost:5000")
    app.run(debug=True, port=5000)
