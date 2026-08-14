# Quick Start — Deploy CollabEdit to AWS

## One-Time Setup (15 minutes, plus RDS/ElastiCache provisioning time)

### 1. Create AWS Resources

See `SETUP.md` for full details:
- RDS PostgreSQL (db.t3.micro, free tier)
- ElastiCache Redis (cache.t3.micro)
- EC2 instance (t3.small, Ubuntu 24.04)
- Security groups (`collab-ec2-sg`, `collab-rds-sg`, `collab-redis-sg`)

### 2. SSH into EC2 and Run Setup

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

curl -O https://raw.githubusercontent.com/YOUR_REPO/main/deployment/aws/setup-ec2.sh
chmod +x setup-ec2.sh
./setup-ec2.sh

# Log out and back in — required for the new docker group membership to take effect.
exit
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

### 3. Clone Repo and Configure

```bash
git clone YOUR_REPO_URL /opt/collab-editor
cd /opt/collab-editor

cp deployment/aws/.env.production.example .env.production
nano .env.production
# Fill in: RDS endpoint + password, ElastiCache endpoint, JWT secrets (openssl rand -hex 32),
# CLIENT_URL, ADMIN_EMAILS.

chmod +x deployment/aws/*.sh deployment/aws/scripts/*.sh
```

### 4. Deploy

```bash
./deployment/aws/deploy.sh
```

This builds both Docker images against RDS/ElastiCache, starts the containers, waits for the
health check to pass, configures the host Nginx, and runs the demo seed.

### 5. (Optional) SSL

```bash
# Point your domain's A record to the EC2 IP first, then:
./deployment/aws/setup-ssl.sh yourdomain.com
```

### 6. Setup Monitoring

```bash
./deployment/aws/scripts/setup-cron.sh
```

## Redeployment (After Code Changes)

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
cd /opt/collab-editor
./deployment/aws/deploy.sh
```

The deploy script pulls the latest code, rebuilds both images, and restarts the containers —
migrations run automatically as part of the server container's startup (see
`server/scripts/docker-entrypoint.sh`), so there's never a separate migration step.

## Useful Commands

```bash
# View logs
./deployment/aws/scripts/view-logs.sh server
./deployment/aws/scripts/view-logs.sh nginx

# Manual health check
curl http://127.0.0.1:3001/api/health

# Manual database backup
./deployment/aws/scripts/backup-db.sh

# Shell into the server container
docker exec -it collab-server sh

# Connect to RDS directly (for debugging)
psql -h YOUR_RDS_ENDPOINT -U collab_admin -d collab_editor

# Re-run the demo seed by hand (upsert-based — safe to run repeatedly)
docker compose -f deployment/aws/docker-compose.production.yml exec -w /app/server server npx prisma db seed

# Restart everything
docker compose -f deployment/aws/docker-compose.production.yml restart

# Nuclear option — rebuild from scratch
docker compose -f deployment/aws/docker-compose.production.yml down
docker system prune -a -f
./deployment/aws/deploy.sh
```

## Estimated Monthly Cost (Free Tier)

| Service | Tier | Cost |
|---------|------|------|
| EC2 t3.small | Not free tier (t2.micro/t3.micro are too small once Puppeteer's Chromium is loaded) | ~$15 |
| RDS db.t3.micro | Free tier (first 12 months) | $0 |
| ElastiCache cache.t3.micro | Free tier (first 12 months) | $0 |
| Elastic IP | Free while attached to a running instance | $0 |
| Data transfer | Free tier (15GB/mo outbound) | $0 |
| **Total** | | **~$15/mo** |

After the free tier expires (RDS + ElastiCache become billable): roughly $40–50/month total.
**Stop the EC2 instance when not actively using it** to avoid paying for idle compute — RDS/
ElastiCache keep running (and billing, once free tier ends) independently unless also stopped.

## Troubleshooting

**Server won't start:**
```bash
docker compose -f deployment/aws/docker-compose.production.yml logs server
# Usually: wrong DATABASE_URL, or the RDS security group doesn't allow collab-ec2-sg on 5432.
```

**WebSocket won't connect:**
```bash
sudo tail -20 /var/log/nginx/error.log
# Usually: missing WebSocket upgrade headers, or `server_name` in collab-editor.conf doesn't
# match the domain/IP actually being requested.
```

**PDF export fails:**
```bash
docker stats
# Puppeteer's Chromium needs real memory headroom. If the server container gets OOM-killed
# during export, that's a sign t3.small is undersized for your load — move to t3.medium.
```

**SSL certificate not renewing:**
```bash
sudo certbot renew --dry-run
# If it fails, check port 80 is open in collab-ec2-sg and the domain's DNS still points here.
```

**Seed command silently does nothing:**
```bash
# `prisma db seed` looks for the `prisma.seed` config in the nearest package.json to its
# working directory — that config lives in server/package.json, not the repo root's. Always
# run it with -w /app/server, exactly as deploy.sh and the command above do.
```
