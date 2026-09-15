# OmniFace v2.0 — Deployment Guide

> **DO NOT DEPLOY** without completing the Pre-Deployment Checklist at the bottom.

---

## Architecture Overview

```
[Browser]
    │ HTTPS
    ▼
[Next.js Frontend — standalone output]
    │ HTTP (internal) via NEXT_PUBLIC_API_URL
    ▼
[FastAPI Backend — Uvicorn / Docker]
    ├── Firebase Admin SDK  → Firestore (auth + persistence)
    └── Cloudinary SDK      → Media upload + transformation
```

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | Backend |
| Node.js 20 LTS | Frontend build |
| Docker (optional) | Backend containerisation |
| Firebase project | Auth + Firestore |
| Cloudinary account | Media storage |
| TLS certificate | REQUIRED in production (HTTPS) |
| Reverse proxy | Nginx / Caddy / Traefik (recommended) |

---

## 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Your Project.
2. **Firestore**: Enable Firestore in **Native mode**. Apply the rules below.
3. **Service Account**: Project Settings → Service Accounts → **Generate New Private Key**.  
   Save the downloaded JSON file securely — this is `FIREBASE_SERVICE_ACCOUNT_PATH`.
4. Apply Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own documents
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 3. Cloudinary Setup

1. Log into [Cloudinary Console](https://console.cloudinary.com).
2. Note your **Cloud Name**, **API Key**, and **API Secret** from the Dashboard.
3. (Recommended) Create a dedicated upload preset restricted to `omniface/uploads/` folder.
4. Set upload limits in Cloudinary settings to match your `MAX_FILE_SIZE_MB`.

---

## 4. Backend Deployment

### 4a. Environment Variables

Copy and fill in:
```bash
cp Backend/backend/.env.example Backend/backend/.env
# Edit .env with your real values
```

Minimum required values:
```env
ENVIRONMENT=production
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-adminsdk.json
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
REQUIRE_AUTH=True
CORS_ORIGINS=["https://your-frontend-domain.com"]
```

### 4b. Run with Docker (Recommended)

```bash
cd Backend/backend

# Build image
docker build -t omniface-backend:latest .

# Run (mount .env and Firebase key)
docker run -d \
  --name omniface-backend \
  -p 8000:8000 \
  --env-file .env \
  -v /path/to/firebase-adminsdk.json:/creds/firebase.json:ro \
  -e FIREBASE_SERVICE_ACCOUNT_PATH=/creds/firebase.json \
  omniface-backend:latest
```

### 4c. Run without Docker (virtualenv)

```bash
cd Backend/backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

### 4d. Verify backend health

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","firestore":"ok","cloudinary":"ok",...}
```

---

## 5. Frontend Deployment

### 5a. Environment Variables

```bash
cd "Frontend/omniface-__-multimodal-deepfake-forensics"
cp .env.example .env.local
# Edit .env.local:
# NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

### 5b. Build

```bash
npm install
npm run build
```

The build produces a `standalone` output in `.next/standalone/`.

### 5c. Run (standalone)

```bash
node .next/standalone/server.js
```

Or wrap it in PM2:
```bash
pm2 start .next/standalone/server.js --name omniface-frontend
```

---

## 6. Reverse Proxy (Nginx Example)

```nginx
# Backend API
server {
    listen 443 ssl;
    server_name api.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/your_cert.pem;
    ssl_certificate_key /etc/ssl/private/your_key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 110M;  # Slightly above MAX_FILE_SIZE_MB
    }
}

# Frontend
server {
    listen 443 ssl;
    server_name app.yourcompany.com;

    ssl_certificate     /etc/ssl/certs/your_cert.pem;
    ssl_certificate_key /etc/ssl/private/your_key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 7. Pre-Deployment Checklist

```
□ Firebase service account JSON is present at FIREBASE_SERVICE_ACCOUNT_PATH
□ Cloudinary credentials are correct and tested
□ REQUIRE_AUTH=True in backend .env
□ ENVIRONMENT=production in backend .env
□ CORS_ORIGINS contains only your production frontend URL
□ NEXT_PUBLIC_API_URL points to your production backend URL
□ TLS certificate is valid and HTTPS is enforced
□ Firestore security rules are applied
□ /health endpoint returns {"status":"ok",...}
□ Test file upload and analysis end-to-end
□ Confirm /docs and /redoc return 404 (production mode)
□ Confirm security headers appear in responses (use https://securityheaders.com)
□ Rate limiting is working (submit >10 requests in 1 minute, expect 429)
□ .env and Firebase key file are NOT committed to git
```

---

## 8. Monitoring & Maintenance

- **Logs**: Both services log to stdout. Use your hosting platform's log aggregation.
- **Health check**: `/health` — returns degraded status if Firebase or Cloudinary is unreachable.
- **Rate limits**: Default 10 requests/minute per IP on `/api/v1/analyze`. Adjust `RATE_LIMIT_ANALYZE`.
- **Storage**: Cloudinary usage visible at console.cloudinary.com. Set Cloudinary bandwidth/storage alerts.
- **Job timeouts**: Video jobs failing with "timed out" → increase `JOB_TIMEOUT_SECONDS` or reduce `VIDEO_FRAME_SAMPLE_COUNT`.
