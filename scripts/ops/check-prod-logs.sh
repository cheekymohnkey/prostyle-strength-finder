#!/bin/bash

# Exit on error
set -e

# Define connection details
REMOTE_USER="ubuntu"
REMOTE_IP="98.87.97.135"
KEY_FILE="$HOME/.ssh/prostyle-prod.pem"

# Number of lines to show (default 20, can override with first argument)
LINES="${1:-20}"

# Validate LINES is a number
if ! [[ "$LINES" =~ ^[0-9]+$ ]]; then
    echo "Error: Number of lines must be a positive integer"
    echo "Usage: $0 [lines]"
    echo "Example: $0 50"
    exit 1
fi

# Check if the key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: SSH key not found at $KEY_FILE"
    echo "Please paste your private key into this file and set permissions:"
    echo "  nano $KEY_FILE"
    echo "  chmod 400 $KEY_FILE"
    exit 1
fi

# Ensure correct permissions on the key file
chmod 400 "$KEY_FILE"

echo "Fetching last $LINES lines from production logs..."
echo ""

# Connect via SSH and run log commands
ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" 'bash -s' << EOF
echo "======= SERVER CLOCK ======="
date -u
timedatectl status | grep -E 'Local time|Universal|NTP|synchronized' || true

echo ""
echo "======= FRONTEND JOURNAL (last $LINES lines) ======="
sudo journalctl -u prostyle-frontend --no-pager -n $LINES || true

echo ""
echo "======= API JOURNAL (last $LINES lines) ======="
sudo journalctl -u prostyle-api --no-pager -n $LINES || true

echo ""
echo "======= NGINX ACCESS LOG (last 50 lines) ======="
sudo tail -50 /var/log/nginx/access.log 2>/dev/null || echo "(no access log)"

echo ""
echo "======= NGINX ERROR LOG (last 20 lines) ======="
sudo tail -20 /var/log/nginx/error.log 2>/dev/null || echo "(no error log)"
EOF

echo ""
echo "✓ Logs fetched successfully"
