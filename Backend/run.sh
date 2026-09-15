#!/usr/bin/env bash
# OmniFace Execution Manager (Bash / Linux / macOS / Git Bash)

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/Omniface2.0/Frontend/omniface-__-multimodal-deepfake-forensics"

show_menu() {
    clear 2>/dev/null || true
    echo "====================================================================="
    echo "                     OMNIFACE EXECUTION MANAGER                      "
    echo "====================================================================="
    echo ""
    echo "  [1] Start Both (Backend & Frontend concurrently)"
    echo "  [2] Start Backend Only (FastAPI - http://127.0.0.1:8000)"
    echo "  [3] Start Frontend Only (Next.js - http://localhost:3000)"
    echo "  [4] Run Backend Tests (pytest)"
    echo "  [5] Install Dependencies (pip requirements + npm packages)"
    echo "  [6] Check Backend Health Endpoint"
    echo "  [7] Exit"
    echo ""
    echo "====================================================================="
    read -p "Select an option [1-7]: " choice
    case "$choice" in
        1) start_both ;;
        2) start_backend ;;
        3) start_frontend ;;
        4) run_tests ;;
        5) install_deps ;;
        6) check_health ;;
        7) exit 0 ;;
        *) echo "Invalid option"; sleep 1; show_menu ;;
    esac
}

start_backend() {
    echo "[*] Starting OmniFace Backend Server on http://127.0.0.1:8000..."
    cd "${BACKEND_DIR}"
    python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
}

start_frontend() {
    echo "[*] Starting OmniFace Frontend Server on http://localhost:3000..."
    cd "${FRONTEND_DIR}"
    npm run dev
}

start_both() {
    echo "[*] Launching Backend & Frontend concurrently..."
    (cd "${BACKEND_DIR}" && python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
    BACKEND_PID=$!
    (cd "${FRONTEND_DIR}" && npm run dev) &
    FRONTEND_PID=$!

    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT INT TERM
    wait
}

run_tests() {
    echo "[*] Running Backend Pytest Suite..."
    cd "${ROOT_DIR}"
    python3 -m pytest backend/tests -v
}

install_deps() {
    echo "[*] Installing Python backend dependencies..."
    cd "${BACKEND_DIR}"
    python3 -m pip install -r requirements.txt

    echo "[*] Installing Node.js frontend dependencies..."
    cd "${FRONTEND_DIR}"
    npm install
    echo "[OK] All dependencies installed."
}

check_health() {
    echo "[*] Checking Backend Health..."
    curl -s http://127.0.0.1:8000/health || echo "[!] Backend is not reachable."
    echo ""
}

case "$1" in
    both) start_both ;;
    backend) start_backend ;;
    frontend) start_frontend ;;
    test|tests) run_tests ;;
    install) install_deps ;;
    health) check_health ;;
    help|-h|--help)
        echo "Usage: ./run.sh [both|backend|frontend|test|install|health]"
        ;;
    *)
        show_menu
        ;;
esac
