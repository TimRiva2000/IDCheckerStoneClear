import base64
import io
import json
import os
import time
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

app = Flask(__name__)

max_bytes = int(os.getenv("MAX_UPLOAD_BYTES", "5242880"))
app.config["MAX_CONTENT_LENGTH"] = max_bytes

cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "*")
CORS(app, resources={r"/upload": {"origins": cors_origins}})

DRIVE_FOLDER_ID = os.getenv("DRIVE_FOLDER_ID", "").strip()
DRIVE_SHARED_DRIVE = os.getenv("DRIVE_SHARED_DRIVE", "false").lower() in ("1", "true", "yes")
DRIVE_PUBLIC = os.getenv("DRIVE_PUBLIC", "true").lower() in ("1", "true", "yes")
DRIVE_FILENAME_PREFIX = os.getenv("DRIVE_FILENAME_PREFIX", "id-upload").strip() or "id-upload"


def _load_service_account_info() -> Optional[dict]:
    raw = os.getenv("DRIVE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    b64 = os.getenv("DRIVE_SERVICE_ACCOUNT_JSON_BASE64", "").strip()
    if not b64:
        return None
    try:
        decoded = base64.b64decode(b64).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return None


def _get_drive_service():
    info = _load_service_account_info()
    if not info:
        raise RuntimeError("Missing or invalid service account JSON")
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    return build("drive", "v3", credentials=creds)


def _safe_filename(original: str) -> str:
    suffix = ""
    if "." in original:
        suffix = "." + original.rsplit(".", 1)[1].lower()
    timestamp = int(time.time())
    return f"{DRIVE_FILENAME_PREFIX}-{timestamp}{suffix or '.jpg'}"


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/upload")
def upload():
    if not DRIVE_FOLDER_ID:
        return jsonify({"error": "missing_drive_folder_id"}), 500

    if "file" not in request.files:
        return jsonify({"error": "file_missing"}), 400

    uploaded = request.files["file"]
    if not uploaded or uploaded.filename == "":
        return jsonify({"error": "file_missing"}), 400

    filename = _safe_filename(uploaded.filename)
    mimetype = uploaded.mimetype or "image/jpeg"

    media = MediaIoBaseUpload(
        uploaded.stream,
        mimetype=mimetype,
        resumable=False,
    )

    metadata = {"name": filename, "parents": [DRIVE_FOLDER_ID]}

    try:
        service = _get_drive_service()
        file_create = service.files().create(
            body=metadata,
            media_body=media,
            fields="id, webViewLink, webContentLink",
            supportsAllDrives=DRIVE_SHARED_DRIVE,
        ).execute()

        file_id = file_create.get("id")

        if DRIVE_PUBLIC and file_id:
            service.permissions().create(
                fileId=file_id,
                body={"type": "anyone", "role": "reader"},
                fields="id",
                supportsAllDrives=DRIVE_SHARED_DRIVE,
            ).execute()

        url = file_create.get("webViewLink")
        if not url and file_id:
            url = f"https://drive.google.com/file/d/{file_id}/view"

        return jsonify({
            "ok": True,
            "fileId": file_id,
            "url": url,
            "name": filename,
        })
    except Exception as exc:
        return jsonify({"error": "upload_failed", "detail": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
