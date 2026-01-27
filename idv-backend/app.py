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
DEBUG_OCR = os.getenv("DEBUG_OCR", "false").lower() in ("1", "true", "yes")
OCR_LANGS = os.getenv("OCR_LANGS", "eng")
OCR_MAX_DIM = int(os.getenv("OCR_MAX_DIM", "1200"))
MRZ_CROP_RATIO = float(os.getenv("MRZ_CROP_RATIO", "0.35"))
DOB_CROP_RATIO = float(os.getenv("DOB_CROP_RATIO", "0.55"))

DATE_PATTERNS = [
    r"\b(\d{2})[./-](\d{2})[./-](\d{4})\b",  # DD.MM.YYYY or MM/DD/YYYY
    r"\b(\d{2})\s+(\d{2})\s+(\d{4})\b",      # DD MM YYYY
    r"\b(\d{4})[./-](\d{2})[./-](\d{2})\b",  # YYYY-MM-DD
    r"\b(\d{2})(\d{2})(\d{4})\b",            # DDMMYYYY
    r"\b(\d{4})(\d{2})(\d{2})\b",            # YYYYMMDD
]

DOB_LABELS = [
    "date of birth",
    "geburtsdatum",
    "date de naissance",
    "data di nascita",
    "data da naschientscha",
]

_DIGIT_FIX_MAP = str.maketrans({
    "O": "0",
    "Q": "0",
    "D": "0",
    "I": "1",
    "L": "1",
    "Z": "2",
    "S": "5",
    "B": "8",
    "G": "6",
})


def _normalize_digits(text):
    return text.upper().translate(_DIGIT_FIX_MAP)


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

    # Heuristic: parse any 6-digit (YYMMDD) or 8-digit (DDMMYYYY) sequences
    normalized_digits = _normalize_digits(text)
    compact = re.sub(r"[^0-9]", " ", normalized_digits)
    for match in re.finditer(r"\b\d{8}\b", compact):
        raw = match.group(0)
        for pattern in (r"(\d{2})(\d{2})(\d{4})", r"(\d{4})(\d{2})(\d{2})"):
            m = re.match(pattern, raw)
            if m:
                parsed = _parse_date_parts(m.groups())
                if isinstance(parsed, tuple):
                    parsed = parsed[0]
                if parsed:
                    return parsed

    for match in re.finditer(r"\b\d{6}\b", compact):
        raw = match.group(0)
        yy = int(raw[0:2])
        mm = int(raw[2:4])
        dd = int(raw[4:6])
        today = date.today()
        century = 1900 if yy > today.year % 100 else 2000
        try:
            candidate = date(century + yy, mm, dd)
            if candidate <= today and candidate.year >= today.year - 120:
                return candidate
        except Exception:
            continue

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

def _run_dob_ocr(image):
    width, height = image.size
    crop_top = int(height * DOB_CROP_RATIO)
    region = image.crop((0, crop_top, width, height))
    region = _preprocess_image(region)
    config = "--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789./- "
    try:
        return pytesseract.image_to_string(region, lang="eng", config=config)
    except Exception:
        return ""

def _run_ocr_with_debug(image_bytes):
    if pytesseract is None or Image is None:
        return "", {}
    try:
        image = Image.open(io.BytesIO(image_bytes))
        mrz_text = _run_mrz_ocr(image)
        if mrz_text:
            return mrz_text, {"mrz_text": mrz_text}
        dob_text = _run_dob_ocr(image)
        if dob_text:
            return dob_text, {"dob_text": dob_text}
        image = _preprocess_image(image)
        config = "--oem 3 --psm 6"
        full_text = pytesseract.image_to_string(image, lang=OCR_LANGS, config=config)
        return full_text, {"full_text": full_text}
    except Exception:
        return "", {}


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

    text, debug = _run_ocr_with_debug(image_bytes)
    dob = _extract_dob(text)
    if not dob:
        response = {"verified": False, "error": "dob_not_found"}
        if DEBUG_OCR:
            response["debug"] = debug
        return jsonify(response), 200

    age = _calculate_age(dob)
    verified = age >= MIN_AGE

    response = {
        "verified": verified,
        "age": age,
        "dob": dob.isoformat(),
        "source": "ocr",
    }
    if DEBUG_OCR:
        response["debug"] = debug
    return jsonify(response)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "ts": datetime.utcnow().isoformat() + "Z"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
