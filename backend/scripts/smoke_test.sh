#!/bin/bash
# Wcarck Hardware Verification Smoke Test
# Run this with sudo on the deployment machine to verify the 802.11 stack

set -e

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <interface>"
  echo "Example: $0 wlan0"
  exit 1
fi

IFACE=$1

echo "========================================"
echo " 1. Killing conflicting processes"
echo "========================================"
airmon-ng check kill || true

echo "========================================"
echo " 2. Starting monitor mode on $IFACE"
echo "========================================"
airmon-ng start "$IFACE"
MON_IFACE=$(iw dev | grep -B 1 "type monitor" | grep Interface | awk '{print $2}')
if [ -z "$MON_IFACE" ]; then
    echo "airmon-ng failed to create monitor interface, trying manual fallback..."
    ip link set "$IFACE" down
    iw dev "$IFACE" set type monitor || iw dev "$IFACE" set monitor otherbss
    ip link set "$IFACE" up
    MON_IFACE="$IFACE"
fi
echo "Monitor interface detected: $MON_IFACE"

echo "========================================"
echo " 3. Setting TX Power"
echo "========================================"
iw dev "$MON_IFACE" set txpower fixed 3000 || echo "Card does not support fixed txpower, skipping."

echo "========================================"
echo " 4. Running airodump-ng test (10 seconds)"
echo "========================================"
timeout 10 airodump-ng "$MON_IFACE" || true

echo "========================================"
echo " 5. Restoring managed mode"
echo "========================================"
airmon-ng stop "$MON_IFACE" || true
systemctl restart NetworkManager || true

echo "Smoke test complete."
