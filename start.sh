#!/usr/bin/env bash
# ============================================================================
#  Wcarck — Unified Installer, Verifier & Launcher
#  Usage: sudo ./start.sh
# ============================================================================
set -euo pipefail

# ── Colors & Symbols ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

PASS="${GREEN}[PASS]${RESET}"
FAIL="${RED}[FAIL]${RESET}"
WARN="${YELLOW}[WARN]${RESET}"
SKIP="${DIM}[SKIP]${RESET}"
ARROW="${CYAN}>>>${RESET}"

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_PORT=8000
FRONTEND_PORT=3000

BACKEND_PID=""
FRONTEND_PID=""

# ── Helpers ──────────────────────────────────────────────────────────────────
banner() {
    echo ""
    echo -e "${BOLD}${CYAN}=======================================================================${RESET}"
    echo -e "${BOLD}${CYAN}  $1${RESET}"
    echo -e "${BOLD}${CYAN}=======================================================================${RESET}"
    echo ""
}

status_pass() { echo -e "  ${PASS}  $1"; }
status_fail() { echo -e "  ${FAIL}  $1"; }
status_warn() { echo -e "  ${WARN}  $1"; }
status_skip() { echo -e "  ${SKIP}  $1"; }
status_info() { echo -e "  ${ARROW} $1"; }

check_binary() {
    command -v "$1" &>/dev/null
}

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${DIM}Shutting down Wcarck...${RESET}"
    if [[ -n "${BACKEND_PID:-}" ]]; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    if [[ -n "${FRONTEND_PID:-}" ]]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Kill any stragglers on our ports
    if check_binary fuser; then
        fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
        fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
    fi
    echo -e "${GREEN}Wcarck stopped cleanly.${RESET}"
}
trap cleanup SIGINT SIGTERM EXIT

# ============================================================================
#  PHASE A: Idempotent Dependency Setup
# ============================================================================
phase_a() {
    banner "PHASE A: DEPENDENCY CHECKS"

    local NEEDS_INSTALL=false

    # ── System packages ──────────────────────────────────────────────────
    status_info "Checking system packages..."
    local PKGS=("aircrack-ng" "hcxdumptool" "hostapd" "dnsmasq" "tshark"
                 "iw" "nftables" "rfkill" "python3" "sqlite3")
    local MISSING_PKGS=()
    for pkg in "${PKGS[@]}"; do
        if ! check_binary "$pkg"; then
            MISSING_PKGS+=("$pkg")
        fi
    done

    if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
        status_warn "Missing packages: ${MISSING_PKGS[*]}"
        NEEDS_INSTALL=true
    else
        status_pass "All system packages present"
    fi

    # ── Node.js ──────────────────────────────────────────────────────────
    status_info "Checking Node.js..."
    if check_binary node; then
        NODE_VER="$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)"
        if [[ "$NODE_VER" -ge 20 ]]; then
            status_pass "Node.js $(node -v) >= 20"
        else
            status_warn "Node.js $(node -v) found but need >= 20"
            NEEDS_INSTALL=true
        fi
    else
        status_warn "Node.js not found"
        NEEDS_INSTALL=true
    fi

    # ── Python venv ──────────────────────────────────────────────────────
    status_info "Checking Python virtual environment..."
    if [[ -d "$VENV_DIR" ]] && [[ -f "$VENV_DIR/bin/python" ]]; then
        status_pass "Python venv exists at backend/.venv"
    else
        status_warn "Python venv not found — will create"
        NEEDS_INSTALL=true
    fi

    # ── Frontend node_modules ────────────────────────────────────────────
    status_info "Checking frontend dependencies..."
    if [[ -d "$FRONTEND_DIR/node_modules" ]]; then
        status_pass "frontend/node_modules present"
    else
        status_warn "frontend/node_modules missing — will install"
        NEEDS_INSTALL=true
    fi

    # ── Run install if needed ────────────────────────────────────────────
    if [[ "$NEEDS_INSTALL" == true ]]; then
        echo ""
        status_info "Running dependency installation..."

        # System packages (requires root)
        if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
            status_info "Installing system packages via apt..."
            apt-get update -qq
            apt-get install -y -qq \
                python3-venv python3-pip python3-dev build-essential \
                sqlite3 aircrack-ng hcxtools macchanger hostapd dnsmasq \
                tshark hashcat nftables iw rfkill mdk4 curl >/dev/null 2>&1
            status_pass "System packages installed"
        fi

        # Node.js (via NodeSource if missing/too old)
        if ! check_binary node || [[ "${NODE_VER:-0}" -lt 20 ]]; then
            status_info "Installing Node.js 20.x via NodeSource..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
            apt-get install -y -qq nodejs >/dev/null 2>&1
            status_pass "Node.js $(node -v) installed"
        fi

        # Python venv
        if [[ ! -d "$VENV_DIR" ]]; then
            status_info "Creating Python virtual environment..."
            python3 -m venv "$VENV_DIR"
            status_pass "Python venv created"
        fi

        # Backend Python packages
        status_info "Installing backend Python packages..."
        "$VENV_DIR/bin/pip" install --upgrade pip -q >/dev/null 2>&1
        cd "$BACKEND_DIR"
        "$VENV_DIR/bin/pip" install -e . -q >/dev/null 2>&1
        cd "$ROOT_DIR"
        status_pass "Backend Python packages installed"

        # Frontend node_modules
        if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
            status_info "Installing frontend npm dependencies..."
            cd "$FRONTEND_DIR"
            npm install --silent >/dev/null 2>&1
            cd "$ROOT_DIR"
            status_pass "Frontend npm dependencies installed"
        fi
    else
        status_pass "All dependencies already satisfied — skipping install"
    fi
}

# ============================================================================
#  PHASE B: System Verification & Health Checks
# ============================================================================
phase_b() {
    banner "PHASE B: SYSTEM VERIFICATION"

    local ALL_PASS=true

    # ── 1. Root privilege ────────────────────────────────────────────────
    status_info "Checking root privileges..."
    if [[ "$EUID" -eq 0 ]]; then
        status_pass "Running as root"
    else
        status_fail "Not running as root — RF tools require sudo"
        ALL_PASS=false
    fi

    # ── 2. Network adapters ──────────────────────────────────────────────
    status_info "Checking wireless adapters..."
    local IFACES=()
    if [[ -d /sys/class/net ]]; then
        for iface in /sys/class/net/wlan* /sys/class/net/mon*; do
            if [[ -d "$iface" ]]; then
                IFACES+=("$(basename "$iface")")
            fi
        done
    fi
    if [[ ${#IFACES[@]} -gt 0 ]]; then
        status_pass "Wireless interfaces: ${IFACES[*]}"
    else
        status_warn "No wireless interfaces detected — attacks will not work, but UI will launch"
    fi

    # ── 3. Database initialization ───────────────────────────────────────
    status_info "Validating database initialization..."
    if [[ -f "$VENV_DIR/bin/python" ]]; then
        if "$VENV_DIR/bin/python" -c "
import asyncio, sys
sys.path.insert(0, '$BACKEND_DIR')
from wcarck.db.session import init_db
asyncio.run(init_db())
" &>/dev/null; then
            status_pass "Database initializes cleanly"
        else
            status_fail "Database initialization failed"
            ALL_PASS=false
        fi
    else
        status_fail "Python venv not available for DB check"
        ALL_PASS=false
    fi

    # ── 4. Backend import verification ───────────────────────────────────
    status_info "Verifying backend imports..."
    if [[ -f "$VENV_DIR/bin/python" ]]; then
        if "$VENV_DIR/bin/python" -c "
import sys
sys.path.insert(0, '$BACKEND_DIR')
from wcarck.main import app
from wcarck.core.event_bus import bus
from wcarck.orchestration.leases import RadioLeaseManager
from wcarck.hardware.process import ManagedProcess
print('All core imports OK')
" &>/dev/null; then
            status_pass "Backend module imports verified"
        else
            status_fail "Backend import check failed — syntax or module error"
            ALL_PASS=false
        fi
    else
        status_fail "Python venv not available for import check"
        ALL_PASS=false
    fi

    # ── 5. Systemd resolved conflict ────────────────────────────────────
    status_info "Checking systemd-resolved DNS stub listener..."
    if [[ -f /etc/systemd/resolved.conf ]]; then
        if grep -q "^DNSStubListener=no" /etc/systemd/resolved.conf 2>/dev/null; then
            status_pass "DNSStubListener disabled (no conflict with dnsmasq)"
        else
            status_warn "DNSStubListener may conflict with dnsmasq — install.sh configures this"
        fi
    else
        status_skip "systemd-resolved config not found — likely fine"
    fi

    # ── 6. Required binary check ─────────────────────────────────────────
    status_info "Verifying critical RF binaries..."
    local RF_BINS=("aircrack-ng" "aireplay-ng" "airodump-ng" "hcxdumptool" "hostapd" "dnsmasq" "iw" "nft")
    local RF_MISSING=()
    for bin in "${RF_BINS[@]}"; do
        if ! check_binary "$bin"; then
            RF_MISSING+=("$bin")
        fi
    done
    if [[ ${#RF_MISSING[@]} -eq 0 ]]; then
        status_pass "All RF binaries available"
    else
        status_warn "Missing RF binaries: ${RF_MISSING[*]} — attacks may fail"
    fi

    # ── Return status ────────────────────────────────────────────────────
    if [[ "$ALL_PASS" == true ]]; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
#  PHASE C: Green Go Status Screen
# ============================================================================
phase_c() {
    local VERIFY_RESULT=$1
    banner "PHASE C: STATUS REPORT"

    if [[ "$VERIFY_RESULT" -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}=========================================================${RESET}"
        echo -e "  ${GREEN}${BOLD}  [✔] ALL SYSTEMS GO: WCARCK IS READY FOR TAKEOFF!      ${RESET}"
        echo -e "  ${GREEN}${BOLD}=========================================================${RESET}"
    else
        echo -e "  ${YELLOW}${BOLD}=========================================================${RESET}"
        echo -e "  ${YELLOW}${BOLD}  [!] WARNINGS DETECTED — UI will launch, but review     ${RESET}"
        echo -e "  ${YELLOW}${BOLD}      the issues above before running attacks.           ${RESET}"
        echo -e "  ${YELLOW}${BOLD}=========================================================${RESET}"
    fi
    echo ""
}

# ============================================================================
#  PHASE D: Port Cleanup & Process Orchestration
# ============================================================================
phase_d() {
    banner "PHASE D: LAUNCHING SERVICES"

    # ── Kill stale processes on our ports ─────────────────────────────────
    status_info "Clearing ports ${BACKEND_PORT} and ${FRONTEND_PORT}..."
    if check_binary fuser; then
        fuser -k "${BACKEND_PORT}/tcp" 2>/dev/null || true
        fuser -k "${FRONTEND_PORT}/tcp" 2>/dev/null || true
    elif check_binary lsof; then
        lsof -ti:"${BACKEND_PORT}" | xargs kill -9 2>/dev/null || true
        lsof -ti:"${FRONTEND_PORT}" | xargs kill -9 2>/dev/null || true
    fi
    sleep 1
    status_pass "Ports cleared"

    # ── Create log directory ─────────────────────────────────────────────
    mkdir -p "$LOG_DIR"

    # ── Start Backend ────────────────────────────────────────────────────
    status_info "Starting backend (uvicorn on port ${BACKEND_PORT})..."
    cd "$BACKEND_DIR"
    "$VENV_DIR/bin/python" -m uvicorn wcarck.main:app \
        --host 0.0.0.0 \
        --port "$BACKEND_PORT" \
        --log-level info \
        > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    cd "$ROOT_DIR"

    # Wait for backend to be ready
    local RETRIES=0
    while ! curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/adapters" &>/dev/null; do
        RETRIES=$((RETRIES + 1))
        if [[ $RETRIES -ge 30 ]]; then
            status_warn "Backend not responding after 15s — check logs/backend.log"
            break
        fi
        sleep 0.5
    done
    if [[ $RETRIES -lt 30 ]]; then
        status_pass "Backend running (PID: ${BACKEND_PID}) on http://127.0.0.1:${BACKEND_PORT}"
    fi

    # ── Start Frontend ───────────────────────────────────────────────────
    status_info "Starting frontend (Vite dev server on port ${FRONTEND_PORT})..."
    cd "$FRONTEND_DIR"
    npm run dev -- --port "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    cd "$ROOT_DIR"
    sleep 3
    status_pass "Frontend running (PID: ${FRONTEND_PID}) on http://127.0.0.1:${FRONTEND_PORT}"

    # ── Open browser ─────────────────────────────────────────────────────
    echo ""
    status_info "Opening browser..."
    local APP_URL="http://localhost:${FRONTEND_PORT}"
    if check_binary xdg-open; then
        xdg-open "$APP_URL" 2>/dev/null || true
    elif check_binary open; then
        open "$APP_URL" 2>/dev/null || true
    elif [[ -n "${WINDIR:-}" ]]; then
        cmd.exe /c start "$APP_URL" 2>/dev/null || true
    else
        status_info "Open ${APP_URL} in your browser"
    fi
}

# ============================================================================
#  MAIN
# ============================================================================
main() {
    echo ""
    echo -e "${BOLD}${CYAN}"
    echo "    __          __       ___  _____ "
    echo "    \ \        / /      / _ \/ ___/ "
    echo "     \ \  /\  / /__ _ _| /_/ /     "
    echo "      \ \/  \/ / _ \ '__|  __/      "
    echo "       \  /\  /  __/ |  | |         "
    echo "        \/  \/ \___|_|  \_/         "
    echo ""
    echo -e "${RESET}"
    echo -e "${DIM}    WiFi Penetration Testing Framework${RESET}"
    echo -e "${DIM}    Unified Launcher v2.0${RESET}"
    echo ""

    # Require root for RF tools
    if [[ "$EUID" -ne 0 ]]; then
        echo -e "${RED}${BOLD}  [-] This script must be run as root (sudo ./start.sh)${RESET}"
        echo -e "${DIM}      RF tools (aireplay-ng, hcxdumptool, etc.) require root privileges.${RESET}"
        exit 1
    fi

    # Phase A: Dependency setup (idempotent)
    phase_a

    # Phase B: System verification
    local VERIFY_RESULT=0
    phase_b || VERIFY_RESULT=$?

    # Phase C: Status screen
    phase_c "$VERIFY_RESULT"

    # Phase D: Launch services
    phase_d

    # Keep alive until Ctrl+C
    echo ""
    echo -e "${DIM}  Logs: ${LOG_DIR}/backend.log, ${LOG_DIR}/frontend.log${RESET}"
    echo -e "${DIM}  Press ${BOLD}Ctrl+C${RESET}${DIM} to stop all services.${RESET}"
    echo ""
    wait
}

main "$@"
