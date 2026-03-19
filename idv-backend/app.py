import logging
import os
import time

import cloudinary
import cloudinary.uploader
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
app.logger.setLevel(logging.INFO)

max_bytes = int(os.getenv("MAX_UPLOAD_BYTES", "5242880"))
app.config["MAX_CONTENT_LENGTH"] = max_bytes

cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "*")
CORS(app, resources={r"/upload": {"origins": cors_origins}})

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "id-uploads").strip() or "id-uploads"
CLOUDINARY_FILENAME_PREFIX = os.getenv("CLOUDINARY_FILENAME_PREFIX", "id-upload").strip() or "id-upload"

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


def _safe_filename(original: str) -> str:
    suffix = ""
    if "." in original:
        suffix = "." + original.rsplit(".", 1)[1].lower()
    timestamp = int(time.time())
    return f"{CLOUDINARY_FILENAME_PREFIX}-{timestamp}{suffix or '.jpg'}"


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/upload")
def upload():
    request_started_at = time.perf_counter()
    app.logger.info("Upload request received")

    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        app.logger.error("Upload failed: Cloudinary env vars are missing")
        return jsonify({"error": "missing_cloudinary_config"}), 500

    if "file" not in request.files:
        app.logger.warning("Upload failed: file field missing in request")
        return jsonify({"error": "file_missing"}), 400

    uploaded = request.files["file"]
    if not uploaded or uploaded.filename == "":
        app.logger.warning("Upload failed: empty filename")
        return jsonify({"error": "file_missing"}), 400

    file_ready_at = time.perf_counter()
    filename = _safe_filename(uploaded.filename)
    mimetype = uploaded.mimetype or "image/jpeg"
    app.logger.info(
        "Processing upload: source_name=%s target_name=%s mimetype=%s request_parse_ms=%.1f",
        uploaded.filename,
        filename,
        mimetype,
        (file_ready_at - request_started_at) * 1000,
    )

    try:
        cloudinary_started_at = time.perf_counter()
        upload_result = cloudinary.uploader.upload(
            uploaded.stream,
            folder=CLOUDINARY_FOLDER,
            public_id=filename.rsplit(".", 1)[0],
            resource_type="image",
            overwrite=False,
            use_filename=False,
            unique_filename=True,
        )

        public_id = upload_result.get("public_id")
        url = upload_result.get("secure_url") or upload_result.get("url")
        finished_at = time.perf_counter()

        app.logger.info(
            "Upload success: public_id=%s cloudinary_ms=%.1f total_ms=%.1f",
            public_id,
            (finished_at - cloudinary_started_at) * 1000,
            (finished_at - request_started_at) * 1000,
        )
        return jsonify({
            "ok": True,
            "fileId": public_id,
            "url": url,
            "name": filename,
        })
    except Exception as exc:
        app.logger.exception("Upload failed with exception")
        return jsonify({"error": "upload_failed", "detail": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
