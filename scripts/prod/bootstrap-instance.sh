#!/usr/bin/env bash
set -euo pipefail

# Bootstraps a fresh Linux instance for Prostyle production deployment.
# Supports Ubuntu and Amazon Linux families.

APP_ROOT="${APP_ROOT:-/opt/prostyle}"
APP_DATA_DIR="${APP_DATA_DIR:-/var/lib/prostyle}"
APP_LOG_DIR="${APP_LOG_DIR:-/var/log/prostyle}"
RUN_USER="${RUN_USER:-$USER}"

if [[ ! -f /etc/os-release ]]; then
  echo "Unsupported OS: /etc/os-release not found"
  exit 1
fi

source /etc/os-release
OS_ID="${ID:-}"
OS_LIKE="${ID_LIKE:-}"

install_ubuntu() {
  sudo apt-get update
  sudo apt-get install -y curl git sqlite3 awscli nginx ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

install_amazon_like() {
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y curl git sqlite awscli nginx ca-certificates
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
  else
    sudo yum install -y curl git sqlite awscli nginx ca-certificates
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
  fi
}

case "$OS_ID" in
  ubuntu|debian)
    install_ubuntu
    ;;
  amzn|rhel|centos|rocky|almalinux|fedora)
    install_amazon_like
    ;;
  *)
    if [[ "$OS_LIKE" == *"debian"* ]]; then
      install_ubuntu
    elif [[ "$OS_LIKE" == *"rhel"* || "$OS_LIKE" == *"fedora"* ]]; then
      install_amazon_like
    else
      echo "Unsupported distribution: ID=$OS_ID ID_LIKE=$OS_LIKE"
      exit 1
    fi
    ;;
esac

sudo mkdir -p "$APP_ROOT" "$APP_DATA_DIR" "$APP_LOG_DIR"
sudo chown -R "$RUN_USER":"$RUN_USER" "$APP_ROOT" "$APP_DATA_DIR" "$APP_LOG_DIR"

echo "Bootstrap complete."
echo "node: $(node -v)"
echo "npm: $(npm -v)"
echo "sqlite3: $(sqlite3 --version | awk '{print $1}')"
echo "aws: $(aws --version 2>&1)"
echo "nginx: $(nginx -v 2>&1)"
