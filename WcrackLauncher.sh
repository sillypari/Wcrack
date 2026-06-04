#!/bin/bash

echo "==========================================="
echo "        Wcrack Launcher"
echo "==========================================="

# Kill any existing node or python processes running on our ports (optional, best-effort)
# This assumes ports 8000 (backend) and 3000 (frontend). Adjust if different.
if command -v fuser &> /dev/null; then
    echo "Cleaning up old processes..."
    fuser -k 8000/tcp 2>/dev/null
    fuser -k 3000/tcp 2>/dev/null
fi

# Define paths
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Start Backend
echo "Starting Backend server..."
cd "$BACKEND_DIR" || exit
if [ -d "venv" ]; then
    source venv/bin/activate
fi
# Using python -m uvicorn to ensure it runs from the correct environment
nohup python -m uvicorn wcarck.main:app --host 0.0.0.0 --port 8000 > backend_launcher.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Start Frontend
echo "Starting Frontend server..."
cd "$FRONTEND_DIR" || exit
if [ -f "package.json" ]; then
    nohup npm run dev > frontend_launcher.log 2>&1 &
    FRONTEND_PID=$!
    echo "Frontend started with PID: $FRONTEND_PID"
else
    echo "Frontend directory or package.json not found!"
fi

echo "Servers are starting up..."
sleep 3

# Determine OS and open browser
APP_URL="http://localhost:3000"
echo "Redirecting to $APP_URL"

if command -v xdg-open &> /dev/null; then
    xdg-open "$APP_URL"
elif command -v open &> /dev/null; then
    open "$APP_URL"
elif command -v start &> /dev/null; then
    start "$APP_URL"
elif [ -n "$WINDIR" ]; then
    cmd.exe /c start "$APP_URL"
else
    echo "Please open your browser and navigate to: $APP_URL"
fi

echo "Press [CTRL+C] to stop both servers."
# Wait for user interrupt to kill children
trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' SIGINT SIGTERM EXIT
wait
