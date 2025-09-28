#!/bin/bash

# Rate Limit Data Collection Scheduler
# Collects rate limit data every 8 hours

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${DATA_DIR:-$HOME/rate-limit-data}"
LOG_FILE="${LOG_FILE:-$DATA_DIR/collection.log}"
COLLECTOR_SCRIPT="$SCRIPT_DIR/rate-limit-collector.cjs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Function to log with timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to run collection
run_collection() {
    log_message "Starting rate limit data collection..."

    # Set the originator override for authentication
    export CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs

    # Run the collector
    if node "$COLLECTOR_SCRIPT" --once --data-dir "$DATA_DIR" --data-file "rate-limit-data.json" 2>&1 | tee -a "$LOG_FILE"; then
        log_message "✓ Collection completed successfully"
        return 0
    else
        log_message "✗ Collection failed"
        return 1
    fi
}

# Function to setup cron job
setup_cron() {
    CRON_CMD="cd $SCRIPT_DIR && $0 --run"
    CRON_JOB="0 */8 * * * $CRON_CMD"

    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "$COLLECTOR_SCRIPT"; then
        echo -e "${YELLOW}Cron job already exists${NC}"
        crontab -l | grep "$COLLECTOR_SCRIPT"
    else
        # Add cron job
        (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
        echo -e "${GREEN}✓ Cron job added to run every 8 hours${NC}"
        echo "  $CRON_JOB"
    fi
}

# Function to remove cron job
remove_cron() {
    crontab -l 2>/dev/null | grep -v "$COLLECTOR_SCRIPT" | crontab -
    echo -e "${GREEN}✓ Cron job removed${NC}"
}

# Function to show status
show_status() {
    echo -e "${GREEN}=== Rate Limit Collection Status ===${NC}"
    echo "Data directory: $DATA_DIR"

    if [ -f "$DATA_DIR/rate-limit-data.json" ]; then
        POINT_COUNT=$(cat "$DATA_DIR/rate-limit-data.json" | grep -o '"timestamp"' | wc -l | tr -d ' ')
        LAST_TIMESTAMP=$(cat "$DATA_DIR/rate-limit-data.json" | grep '"timestamp"' | tail -1 | cut -d'"' -f4)
        echo "Data points collected: $POINT_COUNT"
        echo "Last collection: $LAST_TIMESTAMP"
    else
        echo "No data collected yet"
    fi

    echo ""
    echo "Cron job status:"
    if crontab -l 2>/dev/null | grep -q "$COLLECTOR_SCRIPT"; then
        echo -e "${GREEN}✓ Scheduled${NC}"
        crontab -l | grep "$COLLECTOR_SCRIPT"
    else
        echo -e "${YELLOW}✗ Not scheduled${NC}"
    fi

    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "Recent log entries:"
        tail -5 "$LOG_FILE"
    fi
}

# Parse command line arguments
case "$1" in
    --run)
        run_collection
        ;;
    --setup)
        setup_cron
        echo ""
        show_status
        ;;
    --remove)
        remove_cron
        ;;
    --status)
        show_status
        ;;
    --test)
        echo "Running test collection..."
        run_collection
        ;;
    *)
        echo "Usage: $0 [--run|--setup|--remove|--status|--test]"
        echo ""
        echo "Options:"
        echo "  --run     Run a single collection (used by cron)"
        echo "  --setup   Setup cron job to run every 8 hours"
        echo "  --remove  Remove the cron job"
        echo "  --status  Show collection status"
        echo "  --test    Run a test collection immediately"
        echo ""
        echo "Environment variables:"
        echo "  DATA_DIR  Directory to store data (default: ~/rate-limit-data)"
        echo "  LOG_FILE  Log file path (default: DATA_DIR/collection.log)"
        exit 1
        ;;
esac