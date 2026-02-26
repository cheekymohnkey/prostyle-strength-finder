#!/usr/bin/env bash
set -euo pipefail

# Update nginx configuration on production server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Define connection details (same as other ops scripts)
REMOTE_USER="ubuntu"
REMOTE_IP="98.87.97.135"
KEY_FILE="$HOME/.ssh/prostyle-prod.pem"

if [ ! -f "$KEY_FILE" ]; then
    echo "Error: SSH key not found at $KEY_FILE"
    exit 1
fi

echo "========================================"
echo "Updating Nginx Configuration"
echo "========================================"
echo ""
echo "This will:"
echo "  - Upload the latest nginx config template"
echo "  - Substitute environment variables"
echo "  - Test the new config"
echo "  - Reload nginx"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Uploading nginx config template..."

# Upload the template
scp -i "$KEY_FILE" "$PROJECT_ROOT/deploy/nginx/prostyle.conf.template" "$REMOTE_USER@$REMOTE_IP:/tmp/prostyle.conf.template"

echo "Processing template and reloading nginx..."

# Process template and reload nginx on the server
ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" 'bash -s' << 'EOF'
cd /opt/prostyle/app

# Source environment
set -a
source .env.prod
set +a

# Substitute variables in template
sed \
  -e "s|__API_HOST__|$API_HOST|g" \
  -e "s|__APP_HOST__|$APP_HOST|g" \
  -e "s|__API_PORT__|$API_PORT|g" \
  -e "s|__FRONTEND_PORT__|$FRONTEND_PORT|g" \
  /tmp/prostyle.conf.template > /tmp/prostyle.conf

# Test the config
sudo nginx -t -c /tmp/prostyle.conf 2>&1 || {
    echo "Error: Nginx config test failed"
    cat /tmp/prostyle.conf
    exit 1
}

# If test passes, move to active location and reload
sudo cp /tmp/prostyle.conf /etc/nginx/sites-available/prostyle
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "✓ Nginx configuration updated and reloaded successfully"

# Clean up
rm /tmp/prostyle.conf.template /tmp/prostyle.conf
EOF

echo ""
echo "✓ Nginx update complete"
echo ""
echo "You can verify with:"
echo "  curl -I https://api.cheekymohnkey.com"
