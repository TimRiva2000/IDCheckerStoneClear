# ID Verification OCR Backend (Render)

Minimal Flask API for ID image upload and age verification using Tesseract OCR.

## Endpoints
- `POST /verify` (multipart form, field name: `id_image`)
- `GET /health`

## Environment variables
- `MIN_AGE` (default: 18)
- `MAX_UPLOAD_BYTES` (default: 5242880)
- `CORS_ALLOWED_ORIGINS` (default: `*`)
- `MOCK_VERIFIED` (default: false)

## Render deploy
1. Create a new Render web service from this repo.
2. Use `render.yaml` or set:
   - Build command: `apt-get update && apt-get install -y tesseract-ocr && pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
3. Set `CORS_ALLOWED_ORIGINS` to your Shopify domain (recommended).
4. Copy the Render service URL and paste it into the theme setting `ID verification endpoint`.

## Local run
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
FLASK_APP=app.py flask run --port 5000
```
