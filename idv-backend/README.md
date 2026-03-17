# Required Upload Backend (Render + Cloudinary)

## Endpoints
- `POST /upload` (multipart form, field name: `file`)
- `GET /health`

## Environment variables
- `MAX_UPLOAD_BYTES` (default: 5242880)
- `CORS_ALLOWED_ORIGINS` (default: `*`)
- `CLOUDINARY_CLOUD_NAME` (required)
- `CLOUDINARY_API_KEY` (required)
- `CLOUDINARY_API_SECRET` (required)
- `CLOUDINARY_FOLDER` (default: `id-uploads`)
- `CLOUDINARY_FILENAME_PREFIX` (default: `id-upload`)

## Render deploy
1. Create a new Render web service from this repo.
2. Use `idv-backend/render.yaml` (Docker service).
3. Set `CORS_ALLOWED_ORIGINS` to your Shopify domain (recommended).
4. Set Cloudinary env vars in Render.
5. Copy the Render service URL and paste it into the theme setting `Upload endpoint` as:
   - `https://<your-service>.onrender.com/upload`

## Local run
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
FLASK_APP=app.py flask run --port 5000
```
