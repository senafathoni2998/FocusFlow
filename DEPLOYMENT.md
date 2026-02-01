# Production Deployment Guide

This guide covers deploying FocusFlow using Docker Compose with PostgreSQL.

## Prerequisites

- Docker and Docker Compose installed
- Docker Hub account
- FocusFlow Docker image published to Docker Hub

## Quick Start

1. **Clone and navigate to the project:**
```bash
git clone <repository-url>
cd Focus-FLow
```

2. **Create environment file:**
```bash
cp .env.prod.example .env.prod
```

3. **Edit `.env.prod` with your values:**
```env
DOCKERHUB_USERNAME=your-dockerhub-username
IMAGE_TAG=latest

APP_PORT=3000

POSTGRES_USER=focusflow
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_DB=focusflow

# Use absolute path for production
POSTGRES_DATA_DIR=./data/postgres

NEXTAUTH_URL=http://your-domain.com
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
GROQ_API_KEY=your-groq-api-key
```

4. **Start the application:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

5. **Run database migrations:**
```bash
docker-compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy
```

6. **Access the app:**
```
http://localhost:3000
```

## Data Backup

### Automated Backup Script

```bash
# Backup to ./backups directory
./backup.sh

# Backup to custom directory
./backup.sh /path/to/backups
```

The backup script:
- Creates a timestamped SQL dump
- Compresses it with gzip
- Stores it in the backup directory
- Shows backup size and recent backups

### Manual Backup

```bash
# Create backup directory
mkdir -p ./backups

# Dump database
docker exec focusflow-postgres pg_dump -U focusflow focusflow > ./backups/manual_backup.sql

# Compress
gzip ./backups/manual_backup.sql
```

### External Backup Directory

PostgreSQL data is stored at:
```
./data/postgres  (or your configured POSTGRES_DATA_DIR)
```

You can backup this entire directory:

```bash
# Stop the container first
docker-compose -f docker-compose.prod.yml stop postgres

# Copy the data directory
cp -r ./data/postgres ./backups/postgres_data_$(date +%Y%m%d)

# Restart the container
docker-compose -f docker-compose.prod.yml start postgres
```

## Data Restore

### Using Restore Script

```bash
./restore.sh ./backups/focusflow_backup_20241201_120000.sql.gz
```

### Manual Restore

```bash
# Decompress and restore
gunzip -c ./backups/focusflow_backup_20241201_120000.sql.gz | \
  docker exec -i focusflow-postgres psql -U focusflow focusflow
```

## Maintenance

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f postgres
```

### Update Application

```bash
# Pull new image
docker-compose -f docker-compose.prod.yml pull app

# Restart with new image
docker-compose -f docker-compose.prod.yml up -d app
```

### Stop Services

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop but keep volumes
docker-compose -f docker-compose.prod.yml down
```

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it focusflow-postgres psql -U focusflow focusflow

# Run Prisma Studio (for development)
docker-compose -f docker-compose.prod.yml exec app npx prisma studio
```

## Production Considerations

### Security

1. **Change default passwords** in `.env.prod`
2. **Use strong NEXTAUTH_SECRET**: `openssl rand -base64 32`
3. **Set up firewall rules** to restrict PostgreSQL port access
4. **Use HTTPS** with a reverse proxy (nginx/caddy)

### Reverse Proxy (nginx)

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Monitoring

```bash
# Check container health
docker ps

# Check disk usage
du -sh ./data/postgres

# Check PostgreSQL connections
docker exec focusflow-postgres psql -U focusflow -c "SELECT count(*) FROM pg_stat_activity;"
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs app

# Check if port is already in use
netstat -tlnp | grep 3000
```

### Database connection issues

```bash
# Verify PostgreSQL is running
docker exec focusflow-postgres pg_isready -U focusflow

# Check database exists
docker exec focusflow-postgres psql -U focusflow -l
```

### Data directory permissions

```bash
# Fix permissions if needed
sudo chown -R $USER:$USER ./data/postgres
```
