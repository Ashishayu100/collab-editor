# AWS Deployment Guide — CollabEdit

## Prerequisites

- AWS account with IAM user (not root) having EC2, RDS, ElastiCache, VPC permissions
- A domain name (optional but recommended for SSL — e.g., from Namecheap, Route53, Cloudflare)
- AWS CLI installed locally: `pip install awscli && aws configure`
- SSH key pair created in AWS Console (EC2 → Key Pairs → Create)

## Step 1: VPC & Security Groups

### 1a. Use Default VPC or Create One

For simplicity, use the default VPC in your region (e.g., ap-south-1 for Mumbai).
Note the VPC ID and subnet IDs.

### 1b. Create Security Groups

**EC2 Security Group (`collab-ec2-sg`):**
| Type | Protocol | Port | Source | Purpose |
|------|----------|------|--------|---------|
| SSH | TCP | 22 | Your IP | SSH access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Web traffic |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Web traffic (SSL) |
| Custom TCP | TCP | 3001 | 0.0.0.0/0 | API direct (optional, for testing — remove once Nginx + SSL is confirmed working) |

**RDS Security Group (`collab-rds-sg`):**
| Type | Protocol | Port | Source | Purpose |
|------|----------|------|--------|---------|
| PostgreSQL | TCP | 5432 | collab-ec2-sg | Allow EC2 → RDS |

**ElastiCache Security Group (`collab-redis-sg`):**
| Type | Protocol | Port | Source | Purpose |
|------|----------|------|--------|---------|
| Custom TCP | TCP | 6379 | collab-ec2-sg | Allow EC2 → Redis |

Create these in AWS Console → VPC → Security Groups. Reference the *security group*
(`collab-ec2-sg`) as the source on the RDS/Redis rules, not a raw IP/CIDR — that way it keeps
working if the EC2 instance's IP ever changes.

## Step 2: RDS PostgreSQL

1. Go to AWS Console → RDS → Create Database
2. Settings:
   - Engine: PostgreSQL 16 (matches `postgres:16-alpine` used in local/Docker dev — see
     `server/prisma/schema.prisma`'s `datasource db { provider = "postgresql" }`)
   - Template: **Free Tier** (db.t3.micro)
   - DB Instance Identifier: `collab-db`
   - Master Username: `collab_admin`
   - Master Password: (generate a strong one, save it — `openssl rand -base64 24`)
   - Initial database name: `collab_editor`
   - VPC: Default VPC
   - Security Group: `collab-rds-sg`
   - Public Access: **No** (only accessible from EC2, via the security group rule above)
   - Storage: 20GB gp3 (free tier)
   - Backup: 7-day retention
   - Monitoring: Enable Enhanced Monitoring (free tier includes basic)
3. Wait for status: "Available"
4. Note the **Endpoint** (e.g., `collab-db.xxxx.ap-south-1.rds.amazonaws.com`)

Migrations are applied automatically on every deploy — `server/scripts/docker-entrypoint.sh`
(baked into the server image) runs `prisma migrate deploy` before starting the server. You never
need to run migrations by hand against RDS.

## Step 3: ElastiCache Redis

1. Go to AWS Console → ElastiCache → Create Cluster → Redis OSS
2. Settings:
   - Name: `collab-redis`
   - Node type: `cache.t3.micro` (free tier eligible)
   - Number of replicas: 0 (single node for cost)
   - Subnet group: Default
   - Security Group: `collab-redis-sg`
   - Encryption: In-transit enabled
3. Wait for status: "Available"
4. Note the **Primary Endpoint** (e.g., `collab-redis.xxxx.0001.aps1.cache.amazonaws.com`) — no
   port suffix needed, it's always 6379 unless you changed it.

Redis here is a scaling/presence enhancement, not a hard dependency — the app's own
`RedisPubSub`/`RedisDocumentTracker` (see `server/src/services/`) already degrade gracefully to
single-instance behavior if Redis is ever unreachable, so a misconfigured endpoint won't take
the whole app down, just cross-instance collaboration and rate limiting.

## Step 4: EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Settings:
   - Name: `collab-editor-server`
   - AMI: Ubuntu 24.04 LTS (free tier)
   - Instance type: `t3.small` (2 vCPU, 2GB RAM — t2.micro/t3.micro are too small once Puppeteer's
     Chromium is loaded alongside Node and Postgres/Redis client connections)
   - Key pair: Select your existing key pair
   - Network: Default VPC, public subnet, auto-assign public IP
   - Security Group: `collab-ec2-sg`
   - Storage: 20GB gp3
3. Launch and note the **Public IP** and **Public DNS**
4. (Optional but recommended) Allocate an **Elastic IP** and associate it with the instance —
   without one, the public IP changes if the instance is ever stopped/started, breaking your
   domain's DNS record and any bookmarked links.

## Step 5: SSH into EC2 and Setup

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

Then run the setup script from `setup-ec2.sh` in this directory — see `QUICK_START.md` for the
exact commands.
