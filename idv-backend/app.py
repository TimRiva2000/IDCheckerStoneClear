import base64
import hashlib
import hmac
import logging
import os
import time

import cloudinary
import cloudinary.uploader
import cloudinary.utils
from flask import Flask, jsonify, redirect, request
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
VIEWER_BASE_URL = os.getenv("VIEWER_BASE_URL", "").strip()
VIEWER_BASIC_AUTH_USERNAME = os.getenv("VIEWER_BASIC_AUTH_USERNAME", "").strip()
VIEWER_BASIC_AUTH_PASSWORD = os.getenv("VIEWER_BASIC_AUTH_PASSWORD", "").strip()
VIEWER_TOKEN_SECRET = os.getenv("VIEWER_TOKEN_SECRET", "").strip()

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


def _base64url_encode(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii")).decode("utf-8")


def _sign_value(value: str) -> str:
    if not VIEWER_TOKEN_SECRET:
        raise ValueError("missing_viewer_token_secret")
    return hmac.new(
        VIEWER_TOKEN_SECRET.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _make_asset_token(public_id: str) -> str:
    encoded = _base64url_encode(public_id)
    return f"{encoded}.{_sign_value(encoded)}"


def _parse_asset_token(token: str) -> str | None:
    if "." not in token:
        return None

    encoded, signature = token.rsplit(".", 1)
    expected_signature = _sign_value(encoded)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        return _base64url_decode(encoded)
    except Exception:
        return None


def _viewer_origin() -> str:
    if VIEWER_BASE_URL:
        return VIEWER_BASE_URL.rstrip("/")
    return request.host_url.rstrip("/")


def _build_viewer_url(public_id: str) -> str:
    token = _make_asset_token(public_id)
    return f"{_viewer_origin()}/view/{token}"


def _viewer_auth_valid() -> bool:
    if not VIEWER_BASIC_AUTH_USERNAME or not VIEWER_BASIC_AUTH_PASSWORD:
        return False

    auth = request.authorization
    return bool(
        auth
        and auth.username == VIEWER_BASIC_AUTH_USERNAME
        and auth.password == VIEWER_BASIC_AUTH_PASSWORD
    )


def _viewer_auth_required_response():
    return (
        jsonify({"error": "viewer_auth_required"}),
        401,
        {"WWW-Authenticate": 'Basic realm="ID Upload Viewer"'},
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


@app.get("/view/<token>")
def view_asset(token: str):
    if not VIEWER_TOKEN_SECRET:
        app.logger.error("Viewer failed: VIEWER_TOKEN_SECRET missing")
        return jsonify({"error": "missing_viewer_token_secret"}), 500

    if not VIEWER_BASIC_AUTH_USERNAME or not VIEWER_BASIC_AUTH_PASSWORD:
        app.logger.error("Viewer failed: basic auth env vars missing")
        return jsonify({"error": "missing_viewer_basic_auth"}), 500

    if not _viewer_auth_valid():
        return _viewer_auth_required_response()

    public_id = _parse_asset_token(token)
    if not public_id:
        app.logger.warning("Viewer failed: invalid token")
        return jsonify({"error": "invalid_viewer_token"}), 400

    signed_url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type="image",
        type="authenticated",
        sign_url=True,
        secure=True,
    )
    return redirect(signed_url, code=302)


@app.post("/upload")
def upload():
    app.logger.info("Upload request received")

    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        app.logger.error("Upload failed: Cloudinary env vars are missing")
        return jsonify({"error": "missing_cloudinary_config"}), 500

    if not VIEWER_TOKEN_SECRET:
        app.logger.error("Upload failed: VIEWER_TOKEN_SECRET missing")
        return jsonify({"error": "missing_viewer_token_secret"}), 500

    if "file" not in request.files:
        app.logger.warning("Upload failed: file field missing in request")
        return jsonify({"error": "file_missing"}), 400

    uploaded = request.files["file"]
    if not uploaded or uploaded.filename == "":
        app.logger.warning("Upload failed: empty filename")
        return jsonify({"error": "file_missing"}), 400

    filename = _safe_filename(uploaded.filename)
    mimetype = uploaded.mimetype or "image/jpeg"
    app.logger.info(
        "Processing upload: source_name=%s target_name=%s mimetype=%s",
        uploaded.filename,
        filename,
        mimetype,
    )

    try:
        upload_result = cloudinary.uploader.upload(
            uploaded.stream,
            folder=CLOUDINARY_FOLDER,
            public_id=filename.rsplit(".", 1)[0],
            resource_type="image",
            type="authenticated",
            overwrite=False,
            use_filename=False,
            unique_filename=True,
        )

        public_id = upload_result.get("public_id")
        viewer_url = _build_viewer_url(public_id)

        app.logger.info("Upload success: public_id=%s", public_id)
        return jsonify({
            "ok": True,
            "fileId": public_id,
            "assetId": public_id,
            "url": viewer_url,
            "viewerUrl": viewer_url,
            "name": filename,
        })
    except Exception as exc:
        app.logger.exception("Upload failed with exception")
        return jsonify({"error": "upload_failed", "detail": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
