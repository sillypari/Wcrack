#!/bin/bash
# Wcarck Installation Script
# This script is idempotent and sets up the environment for Wcarck to run securely.

set -euo pipefail

# Ensure the script is run from the directory containing it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root (sudo ./install.sh)"
  exit 1
fi

echo "[+] Installing system dependencies..."
apt-get update
apt-get install -y \
    python3-venv \
    python3-pip \
    python3-dev \
    build-essential \
    sqlite3 \
    aircrack-ng \
    hcxtools \
    macchanger \
    hostapd \
    dnsmasq \
    lighttpd \
    tshark \
    hashcat \
    nftables \
    iw \
    rfkill \
    mdk4 \
    curl

echo "[+] Installing Node.js..."
NODE_MAJOR=0
if command -v node &>/dev/null; then
    NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
fi
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "[+] Installing Node.js 20.x via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "[*] Node.js $(node -v) already installed"
fi

echo "[+] Creating wcarck user and groups..."
if ! id "wcarck" &>/dev/null; then
    useradd -r -s /bin/bash -d /var/lib/wcarck wcarck
else
    usermod -s /bin/bash wcarck
fi
usermod -aG netdev,plugdev,wireshark wcarck

echo "[+] Setting up directories..."
mkdir -p /var/lib/wcarck/{captures,wordlists,db}
mkdir -p /var/log/wcarck
chown -R wcarck:wcarck /var/lib/wcarck /var/log/wcarck
chmod 750 /var/lib/wcarck /var/log/wcarck

echo "[+] Setting up symlink at /opt/wcarck..."
mkdir -p /opt
ln -snf "$SCRIPT_DIR" /opt/wcarck

# Determine the original (non-root) user's group for source-tree write access
if [ -n "${SUDO_USER:-}" ]; then
    REAL_GROUP="$(id -gn "$SUDO_USER")"
else
    REAL_GROUP="$(id -gn)"
fi
# Let wcarck write to the source tree (needed for pip install -e .)
chmod -R g+w "$SCRIPT_DIR"
usermod -aG "$REAL_GROUP" wcarck

echo "[+] Setting up Python virtual environment in /opt/wcarck/backend..."
cd /opt/wcarck/backend
python3 -m venv .venv
chown -R wcarck:wcarck .venv
# Install packages as the wcarck user
sudo -u wcarck .venv/bin/pip install --upgrade pip
sudo -u wcarck .venv/bin/pip install -e .
cd "$SCRIPT_DIR"

echo "[+] Configuring wireless regulatory domain to Bolivia (BO)..."
if command -v iw &>/dev/null; then
    iw reg set BO || true
fi
cp "$SCRIPT_DIR/packaging/systemd/wcarck-reg.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable wcarck-reg.service
systemctl start wcarck-reg.service || true

echo "[+] Configuring NetworkManager to ignore monitor/wireless interfaces..."
mkdir -p /etc/NetworkManager/conf.d
cat <<'EOF' > /etc/NetworkManager/conf.d/99-wcarck.conf
[keyfile]
unmanaged-devices=interface-name:wlan*;interface-name:mon*
EOF
if systemctl is-active --quiet NetworkManager; then
    systemctl reload NetworkManager
fi

echo "[+] Configuring sudoers (NOPASSWD for network tools)..."
cp packaging/sudoers/wcarck /etc/sudoers.d/wcarck
chmod 0440 /etc/sudoers.d/wcarck

echo "[+] Installing udev rules..."
cp packaging/udev/99-wcarck-adapters.rules /etc/udev/rules.d/
udevadm control --reload-rules || true
udevadm trigger || true

echo "[+] Disabling systemd-resolved DNS stub listener for dnsmasq..."
if [ -f /etc/systemd/resolved.conf ]; then
    if grep -q "DNSStubListener" /etc/systemd/resolved.conf; then
        sed -i 's/^#*DNSStubListener=yes/DNSStubListener=no/g' /etc/systemd/resolved.conf
        systemctl restart systemd-resolved || true
    fi
fi

echo "[+] Installing systemd service..."
cp packaging/systemd/wcarck.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable wcarck

echo "[+] Installation complete! You can now start the service using 'sudo systemctl start wcarck'"
