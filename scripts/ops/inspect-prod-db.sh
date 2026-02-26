#!/bin/bash

# Exit on error
set -e

# Define connection details
REMOTE_USER="ubuntu"
REMOTE_IP="98.87.97.135"
KEY_FILE="$HOME/.ssh/prostyle-prod.pem"

# Query type (default: baseline-sets)
QUERY_TYPE="${1:-baseline-sets}"

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

case "$QUERY_TYPE" in
    "baseline-sets"|"baselines")
        echo "Fetching baseline render sets from production..."
        ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" 'bash -s' << 'EOF'
cd /opt/prostyle/app
DB_PATH=$(grep -oP 'DATABASE_URL=\K.*' .env.prod | sed 's/sqlite://')
if [ -z "$DB_PATH" ]; then
    echo "Error: Could not determine database path from .env.prod"
    exit 1
fi

echo "Database: $DB_PATH"
echo ""
echo "======= BASELINE RENDER SETS ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
.width 30 10 10 40 20
SELECT 
    baseline_render_set_id,
    mj_model_family,
    mj_model_version,
    suite_id,
    substr(parameter_envelope_json, 1, 50) AS params_preview,
    status,
    created_by,
    created_at
FROM baseline_render_sets
ORDER BY created_at DESC
LIMIT 20;
SQL

echo ""
echo "======= BASELINE RENDER SET ITEM COUNTS ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
SELECT 
    brs.baseline_render_set_id,
    brs.suite_id,
    COUNT(brsi.item_id) AS item_count
FROM baseline_render_sets brs
LEFT JOIN baseline_render_set_items brsi ON brs.baseline_render_set_id = brsi.baseline_render_set_id
GROUP BY brs.baseline_render_set_id
ORDER BY brs.created_at DESC
LIMIT 20;
SQL
EOF
        ;;
    
    "items"|"baseline-items")
        BASELINE_SET_ID="${2:-}"
        if [ -z "$BASELINE_SET_ID" ]; then
            echo "Error: Baseline set ID required"
            echo "Usage: $0 items <baseline-render-set-id>"
            exit 1
        fi
        
        echo "Fetching items for baseline set: $BASELINE_SET_ID"
        ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" "bash -s $BASELINE_SET_ID" << 'EOF'
BASELINE_SET_ID="$1"
cd /opt/prostyle/app
DB_PATH=$(grep -oP 'DATABASE_URL=\K.*' .env.prod | sed 's/sqlite://')
if [ -z "$DB_PATH" ]; then
    echo "Error: Could not determine database path from .env.prod"
    exit 1
fi

echo "Database: $DB_PATH"
echo ""
echo "======= BASELINE ITEMS FOR $BASELINE_SET_ID ======="
sqlite3 "$DB_PATH" << SQL
.mode column
.headers on
SELECT 
    item_id,
    prompt_key,
    stylize_tier,
    grid_image_id,
    created_at
FROM baseline_render_set_items
WHERE baseline_render_set_id = '$BASELINE_SET_ID'
ORDER BY prompt_key, stylize_tier;
SQL
EOF
        ;;
    
    "suites"|"prompt-suites")
        echo "Fetching baseline prompt suites from production..."
        ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" 'bash -s' << 'EOF'
cd /opt/prostyle/app
DB_PATH=$(grep -oP 'DATABASE_URL=\K.*' .env.prod | sed 's/sqlite://')
if [ -z "$DB_PATH" ]; then
    echo "Error: Could not determine database path from .env.prod"
    exit 1
fi

echo "Database: $DB_PATH"
echo ""
echo "======= BASELINE PROMPT SUITES ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
SELECT 
    suite_id,
    name,
    suite_version,
    status,
    created_at
FROM baseline_prompt_suites
ORDER BY created_at DESC;
SQL

echo ""
echo "======= PROMPT SUITE ITEM COUNTS ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
SELECT 
    bps.suite_id,
    bps.name,
    COUNT(bpsi.item_id) AS prompt_count
FROM baseline_prompt_suites bps
LEFT JOIN baseline_prompt_suite_items bpsi ON bps.suite_id = bpsi.suite_id
GROUP BY bps.suite_id
ORDER BY bps.created_at DESC;
SQL

echo ""
echo "======= SUITE PROMPTS (suite_style_dna_default_v1) ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
.width 10 12 50
SELECT 
    bpsi.prompt_key,
    bpsm.domain,
    substr(bpsi.prompt_text, 1, 50) AS prompt_text
FROM baseline_prompt_suite_items bpsi
LEFT JOIN baseline_prompt_suite_item_metadata bpsm 
    ON bpsi.suite_id = bpsm.suite_id 
    AND bpsi.prompt_key = bpsm.prompt_key
WHERE bpsi.suite_id = 'suite_style_dna_default_v1'
ORDER BY bpsi.display_order;
SQL
EOF
        ;;
    
    "runs"|"style-dna-runs")
        echo "Fetching Style-DNA runs from production..."
        ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" 'bash -s' << 'EOF'
cd /opt/prostyle/app
DB_PATH=$(grep -oP 'DATABASE_URL=\K.*' .env.prod | sed 's/sqlite://')
if [ -z "$DB_PATH" ]; then
    echo "Error: Could not determine database path from .env.prod"
    exit 1
fi

echo "Database: $DB_PATH"
echo ""
echo "======= STYLE-DNA RUNS ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
.width 30 30 30 15 20
SELECT 
    style_dna_run_id,
    style_influence_id,
    baseline_render_set_id,
    status,
    created_at
FROM style_dna_runs
ORDER BY created_at DESC
LIMIT 20;
SQL

echo ""
echo "======= STYLE-DNA RUN COUNTS BY STATUS ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
SELECT 
    status,
    COUNT(*) AS count
FROM style_dna_runs
GROUP BY status;
SQL
EOF
        ;;
    
    "sumPrompt Suite Items', COUNT(*) FROM baseline_prompt_suite_items
UNION ALL
SELECT 'mary"|"overview")
        echo "Fetching production database summary..."
        ssh -i "$KEY_FILE" "$REMOTE_USER@$REMOTE_IP" 'bash -s' << 'EOF'
cd /opt/prostyle/app
DB_PATH=$(grep -oP 'DATABASE_URL=\K.*' .env.prod | sed 's/sqlite://')
if [ -z "$DB_PATH" ]; then
    echo "Error: Could not determine database path from .env.prod"
    exit 1
fi

echo "Database: $DB_PATH"
echo ""
echo "======= DATABASE SUMMARY ======="
sqlite3 "$DB_PATH" << 'SQL'
.mode column
.headers on
SELECT 'Baseline Prompt Suites' AS entity, COUNT(*) AS count FROM baseline_prompt_suites
UNION ALL
SELECT 'Baseline Render Sets', COUNT(*) FROM baseline_render_sets
UNION ALL
SELECT 'Baseline Set Items', COUNT(*) FROM baseline_render_set_items
UNION ALL
SELECT 'Style-DNA Prompt Jobs', COUNT(*) FROM style_dna_prompt_jobs
UNION ALL
SELECT 'Style-DNA Runs', COUNT(*) FROM style_dna_runs
UNION ALL
SELECT 'Style-DNA Run Results', COUNT(*) FROM style_dna_run_results
UNION ALL
SELECT 'Style-DNA Images', COUNT(*) FROM style_dna_images
UNION ALL
SELECT 'Style Influences', COUNT(*) FROM style_influences
UNION ALL
SELECT 'Users', COUNT(*) FROM users;
SQL
EOF
        ;;
    
    *)
        echo "Unknown query type: $QUERY_TYPE"
        echo ""
        echo "Usage: $0 <query-type> [args]"
        echo ""
        echo "Available query types:"
        echo "  baseline-sets          Show all baseline render sets (default)"
        echo "  items <set-id>         Show items for a specific baseline set"
        echo "  suites                 Show baseline prompt suites"
        echo "  runs                   Show Style-DNA runs"
        echo "  summary                Show database overview counts"
        echo ""
        echo "Examples:"
        echo "  $0 baseline-sets"
        echo "  $0 items brs_abc123..."
        echo "  $0 summary"
        exit 1
        ;;
esac

echo ""
echo "✓ Query completed successfully"
