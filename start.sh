#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Resolve project root (wherever start.sh lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${GREEN}🚀 Starting Aperture Analytics Pipeline...${NC}\n"

# ── Pre-flight: kill any stale instances to prevent duplicate pushes ────────
echo -e "${YELLOW}Stopping any existing services...${NC}"
pkill -f "uvicorn app.main:app" 2>/dev/null
pkill -f "daemon.py"           2>/dev/null
pkill -f "node producer.js"    2>/dev/null
pkill -f "node worker.js"      2>/dev/null
# Remove stale PID lock if daemon was killed without cleanup
rm -f "$SCRIPT_DIR/scraper/daemon.pid"
sleep 1
echo ""

# ── Auto-repair venv shebangs if project was moved ─────────────────────────
VENV_PYTHON="$SCRIPT_DIR/scraper/venv/bin/python3.11"
BROKEN_PREFIX=$( head -1 "$SCRIPT_DIR/scraper/venv/bin/uvicorn" 2>/dev/null | sed 's|^#!||' )
if [ -n "$BROKEN_PREFIX" ] && [ "$BROKEN_PREFIX" != "$VENV_PYTHON" ]; then
    echo -e "${YELLOW}⚠️  Fixing stale venv shebangs (project was moved)...${NC}"
    grep -rl "$BROKEN_PREFIX" "$SCRIPT_DIR/scraper/venv/bin/" 2>/dev/null | while read f; do
        sed -i '' "s|$BROKEN_PREFIX|$VENV_PYTHON|g" "$f"
    done
    echo -e "${GREEN}   ✅ Shebangs fixed.${NC}\n"
fi

# 1. FastAPI Server  (use python -m to bypass shebang entirely)
echo -e "${BLUE}[1/5] Starting Scraper API on port 8000...${NC}"
(cd "$SCRIPT_DIR/scraper" && ./venv/bin/python3 -m uvicorn app.main:app --port 8000 --host 0.0.0.0) &
API_PID=$!

# Wait briefly to let the API port bind
sleep 3

# 2. Scraper Daemon
echo -e "${BLUE}[2/5] Starting Scraper Daemon...${NC}"
(cd "$SCRIPT_DIR/scraper" && ./venv/bin/python3 daemon.py) &
DAEMON_PID=$!

# 3. Data Ingestion Producer
echo -e "${BLUE}[3/5] Starting Data Ingestion Producer...${NC}"
(cd "$SCRIPT_DIR/dataIngestion" && node producer.js) &
PRODUCER_PID=$!

# 4. Data Ingestion Worker
echo -e "${BLUE}[4/5] Starting Data Ingestion Worker...${NC}"
(cd "$SCRIPT_DIR/dataIngestion" && node worker.js) &
WORKER_PID=$!

# 5. Web Frontend
if [ -d "$SCRIPT_DIR/web" ]; then
    echo -e "${BLUE}[5/5] Starting Next.js Web App...${NC}"
    (cd "$SCRIPT_DIR/web" && npm run dev) &
    WEB_PID=$!
else
    echo -e "${YELLOW}[5/5] No 'web' directory found. Skipping frontend.${NC}"
    WEB_PID=""
fi

# Cleanup function to kill all background processes on exit
cleanup() {
    echo -e "\n${RED}🛑 Stopping all services...${NC}"
    kill $API_PID $DAEMON_PID $PRODUCER_PID $WORKER_PID $WEB_PID 2>/dev/null
    wait $API_PID $DAEMON_PID $PRODUCER_PID $WORKER_PID $WEB_PID 2>/dev/null
    echo -e "${GREEN}✅ All services stopped.${NC}"
    exit
}

# Trap Ctrl+C (SIGINT) and kill signals (SIGTERM)
trap cleanup SIGINT SIGTERM

echo -e "\n${GREEN}✨ Pipeline is running! Press Ctrl+C to stop everything.${NC}\n"

# Wait for any process to exit (keeps the script running)
wait
