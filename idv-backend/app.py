import io
import os
import re
from datetime import date, datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from PIL import Image
except Exception:
    Image = None

try:
    import pytesseract
except Exception:
    pytesseract = None

app = Flask(__name__)

max_bytes = int(os.getenv("MAX_UPLOAD_BYTES", "5242880"))
app.config["MAX_CONTENT_LENGTH"] = max_bytes

cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "*")
CORS(app, resources={r"/verify": {"origins": cors_origins}})

MIN_AGE = int(os.getenv("MIN_AGE", "18"))
MOCK_VERIFIED = os.getenv("MOCK_VERIFIED", "false").lower() in ("1", "true", "yes")

DATE_PATTERNS = [
    r"\b(\d{2})[./-](\d{2})[./-](\d{4})\b",  # DD/MM/YYYY or MM/DD/YYYY
    r"\b(\d{4})[./-](\d{2})[./-](\d{2})\b",  # YYYY-MM-DD
]


def _parse_date_parts(parts):
    try:
        if len(parts[0]) == 4:
            return date(int(parts[0]), int(parts[1]), int(parts[2]))
        day_first = date(int(parts[2]), int(parts[1]), int(parts[0]))
        month_first = date(int(parts[2]), int(parts[0]), int(parts[1]))
        return day_first, month_first
    except Exception:
        return None


def _extract_dob(text):
    if not text:
        return None

    candidates = []
    for pattern in DATE_PATTERNS:
        for match in re.finditer(pattern, text):
            parts = match.groups()
            parsed = _parse_date_parts(parts)
            if parsed is None:
                continue
            if isinstance(parsed, tuple):
                candidates.extend(list(parsed))
            else:
                candidates.append(parsed)

    today = date.today()
    filtered = []
    for candidate in candidates:
        if candidate > today:
            continue
        if candidate.year < today.year - 120:
            continue
        filtered.append(candidate)

    if not filtered:
        return None

    # Choose the oldest plausible date as DOB
    return sorted(filtered)[0]


def _calculate_age(dob):
    today = date.today()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


def _run_ocr(image_bytes):
    if pytesseract is None or Image is None:
        return ""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        return pytesseract.image_to_string(image)
    except Exception:
        return ""


@app.route("/verify", methods=["POST"])
def verify():
    if MOCK_VERIFIED:
        return jsonify({"verified": True, "age": MIN_AGE, "source": "mock"})

    if "id_image" not in request.files:
        return jsonify({"verified": False, "error": "missing_file"}), 400

    file = request.files["id_image"]
    if not file or file.filename == "":
        return jsonify({"verified": False, "error": "empty_file"}), 400

    image_bytes = file.read()
    if not image_bytes:
        return jsonify({"verified": False, "error": "empty_file"}), 400

    text = _run_ocr(image_bytes)
    dob = _extract_dob(text)
    if not dob:
        return jsonify({"verified": False, "error": "dob_not_found"}), 200

    age = _calculate_age(dob)
    verified = age >= MIN_AGE

    return jsonify(
        {
            "verified": verified,
            "age": age,
            "dob": dob.isoformat(),
            "source": "ocr",
        }
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "ts": datetime.utcnow().isoformat() + "Z"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
