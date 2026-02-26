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

echo "========================================"
echo "Seeding Production Baseline Tests (V1)"
echo "========================================"
echo ""
echo "This will create:"
echo "  - 1 baseline prompt suite (10 prompts)"
echo "  - 3 baseline render sets (stylize: 0, 100, 1000)"
echo "  - Model: Midjourney standard v7"
echo ""
read -p "Enter seed value (default: 777): " SEED_VALUE
SEED_VALUE=${SEED_VALUE:-777}
echo ""
echo "Using seed: $SEED_VALUE"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Connecting to production server..."

# Run the seed script on the remote server
ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" "bash -s $SEED_VALUE" << 'EOF'
SEED_VALUE="$1"
cd /opt/prostyle/app

# Source environment
set -a
source .env.prod
set +a

echo "Running baseline seed script with seed=$SEED_VALUE..."
echo ""

# Run the seed script with the production environment and custom seed
BASELINE_SEED="$SEED_VALUE" node scripts/style-dna/seed-canonical-baselines.js

SEED_EXIT_CODE=$?

if [ $SEED_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✓ Baseline seed completed successfully"
    
    # Show what was created
    DB_PATH=$(grep -oP 'DATABASE_URL=\K.*' .env.prod | sed 's/sqlite://')
    echo ""
    echo "======= VERIFICATION ======="
    sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
SELECT 'Prompt Suite' AS entity, suite_id AS id, name 
FROM baseline_prompt_suites 
WHERE suite_id = 'suite_style_dna_default_v1'
UNION ALL
SELECT 'Baseline Set', baseline_render_set_id, 
       'MJ ' || mj_model_family || ' v' || mj_model_version || 
       ' | s=' || json_extract(parameter_envelope_json, '$.stylizeTier')
FROM baseline_render_sets
WHERE suite_id = 'suite_style_dna_default_v1'
ORDER BY entity DESC;
SQL
    
    echo ""
    echo "======= PROMPT SUITE ITEMS (10 prompts) ======="
    sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
.width 10 12 50
SELECT 
    prompt_key,
    bpsm.domain,
    substr(bpsi.prompt_text, 1, 50) AS prompt_text
FROM baseline_prompt_suite_items bpsi
LEFT JOIN baseline_prompt_suite_item_metadata bpsm 
    ON bpsi.suite_id = bpsm.suite_id 
    AND bpsi.prompt_key = bpsm.prompt_key
WHERE bpsi.suite_id = 'suite_style_dna_default_v1'
ORDER BY bpsi.display_order;
SQL
else
    echo ""
    echo "✗ Baseline seed failed with exit code: $SEED_EXIT_CODE"
    exit $SEED_EXIT_CODE
fi
EOF

SSH_EXIT_CODE=$?

if [ $SSH_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✓ Production baseline seed completed!"
    echo "========================================"
    echo ""
    echo "You can now use these baseline sets in the admin UI:"
    echo "  https://app.cheekymohnkey.com/admin/style-dna"
else
    echo ""
    echo "✗ SSH command failed with exit code: $SSH_EXIT_CODE"
    exit $SSH_EXIT_CODE
fi
