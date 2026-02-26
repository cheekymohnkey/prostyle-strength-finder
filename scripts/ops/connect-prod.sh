#!/bin/bash

# Exit on error
set -e

# Define connection details
REMOTE_USER="ubuntu"
REMOTE_IP="98.87.97.135"
KEY_FILE="$HOME/.ssh/prostyle-prod.pem"

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

echo "Connecting to $REMOTE_USER@$REMOTE_IP..."

# Connect via SSH
ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP"
