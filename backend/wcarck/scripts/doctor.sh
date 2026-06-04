#!/bin/bash
# Wcarck Diagnostic Script (doctor.sh)

set -e

echo "{"
echo "  \"diagnostics\": ["

# 1. Check iw dev
echo "    {"
echo "      \"section\": \"iw_dev\","
if command -v iw >/dev/null 2>&1; then
    output=$(iw dev | tr '\n' ' ' | sed 's/"/\\"/g')
    echo "      \"output\": \"$output\""
else
    echo "      \"output\": \"iw command not found\""
fi
echo "    },"

# 2. Orphaned PIDs
echo "    {"
echo "      \"section\": \"orphaned_pids\","
if command -v pgrep >/dev/null 2>&1; then
    output=$(pgrep -l "airodump-ng|aireplay-ng|hcxdumptool|hostapd|dnsmasq" | tr '\n' ' ' | sed 's/"/\\"/g' || echo "None")
    echo "      \"output\": \"$output\""
else
    echo "      \"output\": \"pgrep not found\""
fi
echo "    },"

# 3. WAL Size
echo "    {"
echo "      \"section\": \"wal_size\","
if [ -f "/var/lib/wcarck/wcarck.db-wal" ]; then
    size=$(stat -c%s "/var/lib/wcarck/wcarck.db-wal")
    echo "      \"output\": \"${size} bytes\""
else
    echo "      \"output\": \"No WAL file found\""
fi
echo "    },"

# 4. Free Disk
echo "    {"
echo "      \"section\": \"disk_free\","
output=$(df -h / | awk 'NR==2 {print $4}')
echo "      \"output\": \"$output\""
echo "    }"

echo "  ]"
echo "}"
