#!/bin/bash

# FocusFlow PostgreSQL Backup Script
# Usage: ./backup.sh [backup_directory]

set -e

# Configuration
BACKUP_DIR="${1:-./backups}"
DATA_DIR="${POSTGRES_DATA_DIR:-./data/postgres}"
CONTAINER_NAME="focusflow-postgres"
POSTGRES_USER="${POSTGRES_USER:-focusflow}"
POSTGRES_DB="${POSTGRES_DB:-focusflow}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/focusflow_backup_$TIMESTAMP.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== FocusFlow PostgreSQL Backup ===${NC}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}Error: Container '$CONTAINER_NAME' is not running${NC}"
    echo "Please start the application first with: docker-compose -f docker-compose.prod.yml up -d"
    exit 1
fi

echo -e "${YELLOW}Creating backup...${NC}"

# Run pg_dump inside the container
docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Get file size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo -e "${GREEN}✓ Backup completed successfully${NC}"
echo "  Location: $BACKUP_FILE"
echo "  Size: $BACKUP_SIZE"

# List recent backups
echo -e "\n${YELLOW}Recent backups:${NC}"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5 || echo "  No previous backups found"

echo -e "\n${YELLOW}To restore from backup:${NC}"
echo "  gunzip -c $BACKUP_FILE | docker exec -i $CONTAINER_NAME psql -U $POSTGRES_USER $POSTGRES_DB"
