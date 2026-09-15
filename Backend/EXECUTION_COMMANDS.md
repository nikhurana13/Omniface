# OmniFace — Execution Commands & Developer Guide

This document contains all the commands needed to run, test, build, and deploy both the **FastAPI Backend** and the **Next.js Frontend** of OmniFace.

---

## 🚀 Quick Start (Automated Scripts)

We have provided cross-platform runner scripts in the root directory:

### Windows (Command Prompt / Double Click)
```cmd
run.bat
```
*(You can double-click `run.bat` in Windows Explorer or run it from CMD. You can also pass direct arguments: `run.bat both`, `run.bat backend`, `run.bat frontend`, `run.bat test`, `run.bat install`, `run.bat health`)*

### Windows (PowerShell)
```powershell
.\run.ps1
# Or with specific targets:
.\run.ps1 -Target both
.\run.ps1 -Target backend
.\run.ps1 -Target frontend
.\run.ps1 -Target test
.\run.ps1 -Target install
```

### Linux / macOS / Git Bash
```bash
chmod +x run.sh
./run.sh both
```

---

## 📌 Services & Ports Overview

| Component | Technology | Default URL / Port | Working Directory |
| :--- | :--- | :--- | :--- |
| **Backend API** | FastAPI + Uvicorn | `http://127.0.0.1:8000` | `backend/` |
| **API Docs (Swagger)** | OpenAPI / Swagger UI | `http://127.0.0.1:8000/docs` | `backend/` |
| **Health Check** | JSON Endpoint | `http://127.0.0.1:8000/health` | `backend/` |
| **Frontend Web App**| Next.js 15 + React 19 | `http://localhost:3000` | `Omniface2.0/Frontend/omniface-__-multimodal-deepfake-forensics/` |

---

## 🐍 Backend Execution Commands (FastAPI)

### 1. (Optional) Create and Activate Virtual Environment
From repository root:
```powershell
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Windows (Command Prompt)
python -m venv venv
venv\Scripts\activate.bat

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies
```powershell
# If you are inside the backend/ folder:
pip install -r requirements.txt

# Or if you are in the root directory:
pip install -r backend/requirements.txt
```

### 3. Verify Environment File
Make sure `backend/.env` exists and contains your credentials:
```env
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your/firebase-service-account.json
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
REQUIRE_AUTH=True
MAX_FILE_SIZE_MB=100
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

### 4. Run Development Server
```powershell
# From root directory:
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000

# Or from the backend directory:
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 5. Run Backend Unit & Integration Tests
```powershell
# Run from repository root:
python -m pytest backend/tests -v

# Or run from backend directory:
cd backend
python -m pytest tests -v
```

### 6. Verify Health Check
```powershell
# PowerShell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" | ConvertTo-Json

# Curl (Bash / CMD)
curl -s http://127.0.0.1:8000/health
```

Expected output:
```json
{
  "status": "ok",
  "timestamp": "...",
  "version": "1.0.0",
  "services": {
    "firestore": "connected",
    "cloudinary": "connected"
  }
}
```

---

## ⚛️ Frontend Execution Commands (Next.js)

The frontend application is located in `Omniface2.0/Frontend/omniface-__-multimodal-deepfake-forensics`.

### 1. Navigate to Frontend Directory
```powershell
cd Omniface2.0/Frontend/omniface-__-multimodal-deepfake-forensics
```

### 2. Install Dependencies
```powershell
npm install
```

### 3. Verify Environment Variable
Check `.env.local` inside the frontend directory:
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

### 4. Start Development Server
```powershell
npm run dev
```
Open your browser and navigate to **`http://localhost:3000`**.

### 5. Production Build & Start
```powershell
# Build the production bundle
npm run build

# Start the production server
npm start
```

### 6. Linting
```powershell
npm run lint
```

---

## 🔄 Running Both Simultaneously (Manual)

If you prefer using two separate terminal tabs:

### Terminal 1 (Backend):
```powershell
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Terminal 2 (Frontend):
```powershell
cd Omniface2.0/Frontend/omniface-__-multimodal-deepfake-forensics
npm run dev
```

---

## 🐳 Docker Commands (Backend Container)

### 1. Build Docker Image
```bash
docker build -t omniface-backend -f backend/Dockerfile backend/
```

### 2. Run Container
```bash
docker run -d --name omniface-api -p 8000:8000 --env-file backend/.env omniface-backend
```

### 3. Check Logs & Stop
```bash
docker logs -f omniface-api
docker stop omniface-api
docker rm omniface-api
```

---

## 📡 Testing Core API Endpoints

Once the backend is running:

### 1. Health Status:
```bash
curl http://127.0.0.1:8000/health
```

### 2. Upload and Analyze Media File:
```powershell
# Windows PowerShell
$filePath = "path/to/test.jpg"
$form = @{
    file = Get-Item -Path $filePath
}
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/analyze" -Method Post -Form $form
```

```bash
# Bash / cURL
curl -X POST "http://127.0.0.1:8000/api/v1/analyze" \
     -F "file=@path/to/sample.jpg"
```

### 3. Check Job Status:
```bash
curl http://127.0.0.1:8000/api/v1/jobs/{jobId}
```

### 4. Fetch Analysis Report:
```bash
curl http://127.0.0.1:8000/api/v1/reports/{reportId}
```

---

## 🛠️ Troubleshooting & FAQ

1. **`Port 8000 or 3000 already in use`**:
   - Find process: `netstat -ano | findstr :8000` (or `:3000`)
   - Terminate process: `taskkill /PID <PID> /F`
2. **`Settings validation error: firebase_service_account_path missing`**:
   - Ensure you are running the backend with `backend/.env` configured. The configuration is set to automatically load `backend/.env` regardless of working directory.
3. **`'next' is not recognized as an internal or external command`**:
   - Run `npm install` inside `Omniface2.0/Frontend/omniface-__-multimodal-deepfake-forensics`.
4. **`Unauthorized (401) on API endpoints`**:
   - For local development, set `REQUIRE_AUTH=False` in `backend/.env` so requests work without Firebase user auth tokens.
