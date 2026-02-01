#!/bin/bash

# FocusFlow PostgreSQL Restore Script
# Usage: ./restore.sh <backup_file.sql.gz>

set -e

# Configuration
CONTAINER_NAME="focusflow-postgres"
POSTGRES_USER="${POSTGRES_USER:-focusflow}"
POSTGRES_DB="${POSTGRES_DB:-focusflow}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide a backup file${NC}"
    echo "Usage: ./restore.sh <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh ./backups/*.sql.gz 2>/dev/null || echo "  No backups found in ./backups/"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file '$BACKUP_FILE' not found${NC}"
    exit 1
fi

echo -e "${GREEN}=== FocusFlow PostgreSQL Restore ===${NC}"
echo -e "${YELLOW}Backup file: $BACKUP_FILE${NC}"

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}Error: Container '$CONTAINER_NAME' is not running${NC}"
    echo "Please start the application first with: docker-compose -f docker-compose.prod.yml up -d"
    exit 1
fi

# Warning
echo -e "${RED}⚠️  WARNING: This will replace all data in the database!${NC}"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo -e "${YELLOW}Restoring backup...${NC}"

# Restore the backup
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo -e "${GREEN}✓ Restore completed successfully${NC}"
