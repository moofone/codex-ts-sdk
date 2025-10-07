#!/bin/bash

# Rate Limit Data Collection Script
# Collects a single rate limit data point and cleans up old data

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${DATA_DIR:-$HOME/rate-limit-data}"
LOG_FILE=""
COLLECTOR_SCRIPT="$SCRIPT_DIR/rate-limit-collector.cjs"
WINDOW_DAYS=7  # Keep data for 7 days (1 week)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --data-dir)
            DATA_DIR="$2"
            shift 2
            ;;
        --status)
            ACTION="status"
            shift
            ;;
        --window-days)
            WINDOW_DAYS="$2"
            shift 2
            ;;
        *)
            echo "Usage: $0 [--data-dir <path>] [--window-days <days>] [--status]"
            echo ""
            echo "Options:"
            echo "  --data-dir <path>     Directory to store data (default: ~/rate-limit-data)"
            echo "  --window-days <days>  Days to keep data (default: 7)"
            echo "  --status             Show collection status"
            exit 1
            ;;
    esac
done

# Set log file after DATA_DIR is determined
LOG_FILE="${LOG_FILE:-$DATA_DIR/collection.log}"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Function to log with timestamp
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to cleanup old data points
cleanup_old_data() {
    local DATA_FILE="$DATA_DIR/rate-limit-data.json"

    if [ ! -f "$DATA_FILE" ]; then
        return 0
    fi

    # Calculate cutoff timestamp (current time - window days)
    local CUTOFF_TIMESTAMP=$(date -u -v-${WINDOW_DAYS}d +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)
    if [ $? -ne 0 ]; then
        # Fallback for Linux systems (GNU date)
        CUTOFF_TIMESTAMP=$(date -u -d "${WINDOW_DAYS} days ago" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)
    fi

    if [ -z "$CUTOFF_TIMESTAMP" ]; then
        log_message "Warning: Could not calculate cutoff timestamp for cleanup"
        return 1
    fi

    # Create temp file for filtered data
    local TEMP_FILE="$DATA_FILE.tmp"

    # Use node to filter the JSON data
    node -e "
        const fs = require('fs');
        try {
            const data = JSON.parse(fs.readFileSync('$DATA_FILE', 'utf8'));
            const cutoff = new Date('$CUTOFF_TIMESTAMP').getTime();

            // Filter data points
            const filtered = data.filter(point => {
                const pointTime = new Date(point.timestamp).getTime();
                return pointTime >= cutoff;
            });

            const removed = data.length - filtered.length;

            // Write filtered data
            fs.writeFileSync('$TEMP_FILE', JSON.stringify(filtered, null, 2));

            console.log(removed);
        } catch (e) {
            console.error('Error filtering data:', e.message);
            process.exit(1);
        }
    " 2>/dev/null

    local REMOVED_COUNT=$?

    if [ -f "$TEMP_FILE" ]; then
        # Get count of removed items
        local ORIGINAL_COUNT=$(cat "$DATA_FILE" | grep -o '"timestamp"' | wc -l | tr -d ' ')
        local NEW_COUNT=$(cat "$TEMP_FILE" | grep -o '"timestamp"' | wc -l | tr -d ' ')
        local REMOVED=$((ORIGINAL_COUNT - NEW_COUNT))

        # Replace original file with filtered data
        mv "$TEMP_FILE" "$DATA_FILE"

        if [ $REMOVED -gt 0 ]; then
            log_message "Cleaned up $REMOVED data points older than $WINDOW_DAYS days"
        fi
    else
        log_message "Warning: Cleanup failed - keeping all data"
    fi
}

# Function to run collection
run_collection() {
    log_message "Starting rate limit data collection..."

    # Set the originator override for authentication
    export CODEX_INTERNAL_ORIGINATOR_OVERRIDE=codex_cli_rs

    # Run the collector
    if node "$COLLECTOR_SCRIPT" --once --data-dir "$DATA_DIR" --data-file "rate-limit-data.json" 2>&1 | tee -a "$LOG_FILE"; then
        log_message "✓ Collection completed successfully"

        # Cleanup old data after successful collection
        cleanup_old_data

        return 0
    else
        log_message "✗ Collection failed"
        return 1
    fi
}

# Function to show status
show_status() {
    echo -e "${GREEN}=== Rate Limit Collection Status ===${NC}"
    echo "Data directory: $DATA_DIR"
    echo "Data window: $WINDOW_DAYS days"

    if [ -f "$DATA_DIR/rate-limit-data.json" ]; then
        POINT_COUNT=$(cat "$DATA_DIR/rate-limit-data.json" | grep -o '"timestamp"' | wc -l | tr -d ' ')
        FIRST_TIMESTAMP=$(cat "$DATA_DIR/rate-limit-data.json" | grep '"timestamp"' | head -1 | cut -d'"' -f4)
        LAST_TIMESTAMP=$(cat "$DATA_DIR/rate-limit-data.json" | grep '"timestamp"' | tail -1 | cut -d'"' -f4)
        echo "Data points collected: $POINT_COUNT"
        echo "Oldest data point: $FIRST_TIMESTAMP"
        echo "Latest data point: $LAST_TIMESTAMP"
    else
        echo "No data collected yet"
    fi

    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "Recent log entries:"
        tail -5 "$LOG_FILE"
    fi
}

# Execute action
if [[ "$ACTION" == "status" ]]; then
    show_status
else
    run_collection
fi