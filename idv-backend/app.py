import io
import os
import re
from datetime import date, datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from PIL import Image, ImageOps, ImageFilter
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
OCR_LANGS = os.getenv("OCR_LANGS", "eng")
OCR_MAX_DIM = int(os.getenv("OCR_MAX_DIM", "1200"))
MRZ_CROP_RATIO = float(os.getenv("MRZ_CROP_RATIO", "0.35"))

DATE_PATTERNS = [
    r"\b(\d{2})[./-](\d{2})[./-](\d{4})\b",  # DD.MM.YYYY or MM/DD/YYYY
    r"\b(\d{2})\s+(\d{2})\s+(\d{4})\b",      # DD MM YYYY
    r"\b(\d{4})[./-](\d{2})[./-](\d{2})\b",  # YYYY-MM-DD
]

DOB_LABELS = [
    "date of birth",
    "geburtsdatum",
    "date de naissance",
    "data di nascita",
    "data da naschientscha",
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


def _extract_mrz_dob(lines):
    mrz_lines = [line for line in lines if line.count("<") >= 5 and len(line.replace(" ", "")) >= 28]
    if len(mrz_lines) < 2:
        return None
    mrz_lines = [line.replace(" ", "") for line in mrz_lines][-3:]
    line2 = mrz_lines[1] if len(mrz_lines) >= 2 else None
    if not line2 or len(line2) < 20:
        return None
    # ICAO 9303 ID-1: birth date is at positions 14-19 (1-based) on line 2
    dob_raw = line2[13:19]
    if not re.fullmatch(r"\d{6}", dob_raw or ""):
        return None
    yy = int(dob_raw[0:2])
    mm = int(dob_raw[2:4])
    dd = int(dob_raw[4:6])
    today = date.today()
    century = 1900 if yy > today.year % 100 else 2000
    try:
        return date(century + yy, mm, dd)
    except Exception:
        return None


def _extract_dob(text):
    if not text:
        return None

    normalized = text.replace("\r", "\n")
    lines = [line.strip() for line in normalized.split("\n") if line.strip()]

    # Try MRZ first (more reliable on Swiss IDs)
    mrz_dob = _extract_mrz_dob(lines)
    if mrz_dob:
        return mrz_dob

    # Look for DOB labels and scan nearby lines
    for idx, line in enumerate(lines):
        lower = line.lower()
        if any(label in lower for label in DOB_LABELS):
            nearby = " ".join(lines[idx: idx + 3])
            for pattern in DATE_PATTERNS:
                match = re.search(pattern, nearby)
                if match:
                    parsed = _parse_date_parts(match.groups())
                    if isinstance(parsed, tuple):
                        parsed = parsed[0]
                    return parsed

    # Fallback: any plausible date in the text
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

    return sorted(filtered)[0]


def _calculate_age(dob):
    today = date.today()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


def _preprocess_image(image):
    # Light preprocessing to improve OCR on IDs
    image = ImageOps.exif_transpose(image)
    image = image.convert("L")
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.SHARPEN)
    width, height = image.size
    if max(width, height) > OCR_MAX_DIM:
        scale = OCR_MAX_DIM / float(max(width, height))
        image = image.resize((int(width * scale), int(height * scale)))
    elif max(width, height) < 800:
        image = image.resize((width * 2, height * 2))
    return image


def _run_mrz_ocr(image):
    # Focus on the MRZ (bottom area) to reduce OCR cost and improve accuracy
    width, height = image.size
    crop_top = int(height * (1 - MRZ_CROP_RATIO))
    mrz = image.crop((0, crop_top, width, height))
    mrz = _preprocess_image(mrz)
    config = "--oem 3 --psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
    try:
        return pytesseract.image_to_string(mrz, lang="eng", config=config)
    except Exception:
        return ""


def _run_ocr(image_bytes):
    if pytesseract is None or Image is None:
        return ""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        mrz_text = _run_mrz_ocr(image)
        if mrz_text:
            return mrz_text
        image = _preprocess_image(image)
        config = "--oem 3 --psm 6"
        return pytesseract.image_to_string(image, lang=OCR_LANGS, config=config)
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
