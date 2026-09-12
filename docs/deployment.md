# Carestead Deployment & Development Guide

## Overview

Carestead runs on two environments during development and testing:
- **Local Development**: Direct Vite dev server on HTTPS (carestead.com:5173)
- **Docker Preview**: Wrangler Workers emulation with dual ports (HTTP:8080, HTTPS:8083)

Both environments use the same hostname (`carestead.com`) and configuration format for consistency.

**Quick Setup**:
```bash
make host-config  # One-time: configure /etc/hosts
make install      # One-time: install dependencies
make dev          # Local: https://carestead.com:5173
# OR
make up           # Docker: http://carestead.com:8080 or https://carestead.com:8083
```

---

## Prerequisites

### System Requirements
- Node.js 22.13.0 or higher
- Docker 29.6.1 or higher
- Docker Compose 5.3.0 or higher

### Local Setup
- `/etc/hosts` entry: `127.0.0.1 carestead.com`
- HTTPS certificates in `web/.certs/`:
  - `carestead.pem` (certificate)
  - `carestead-key.pem` (private key)

Verify setup:
```bash
grep carestead.com /etc/hosts    # Should show: 127.0.0.1 carestead.com
ls web/.certs/                  # Should list both .pem files
```

---

## Local Development

### Start Development Server

```bash
make install     # First time: install locked dependencies
make dev         # Start Vite dev server
```

**Access**: https://carestead.com:5173

### Features
- Hot module replacement (HMR)
- HTTPS with local certificates
- In-memory D1 database
- Real-time code updates

### Environment

The dev server uses `web/.dev.vars` for configuration. This file is created automatically by:
```bash
make local-init  # Creates .dev.vars from .dev.vars.example (non-destructive)
```

Edit `web/.dev.vars` to configure integrations (optional):
- Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_KEY`
- Browser Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Email Notifications: `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM`
- SMS Notifications: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

---

## Docker Preview

### Start Docker Container

```bash
make host-config # Configure /etc/hosts with carestead.com (one-time, may prompt for password)
make local-init  # Create .dev.vars (one-time, non-destructive)
make up          # Build and start Docker container (handles host-config automatically)
```

**Access**:
- HTTP: http://carestead.com:8080
- HTTPS: https://carestead.com:8083

### Container Details
- **Image**: carestead:local
- **Ports**: 
  - 8080 → HTTP traffic
  - 8083 → HTTPS traffic
- **Binding**: 127.0.0.1 (localhost)
- **Database**: Persistent SQLite volume (`carestead-data`)
- **Config**: Reads `web/.dev.vars` from host
- **Lifecycle**: Restarts automatically unless stopped

### Operations

```bash
make logs        # Follow container logs
make down        # Stop container (keeps database volume)
make up          # Restart with latest build
```

### Volume Persistence

The Docker container maintains a named volume `carestead-data` for the database:

```bash
docker volume ls | grep carestead   # List volume
docker volume inspect carestead-data # Inspect volume details
```

To reset the database:
```bash
make down
docker volume rm carestead-data
make up          # Fresh database
```

---

## Health Check

All environments expose a health check endpoint:

```bash
# Local development (HTTPS only)
curl https://carestead.com:5173/api/health

# Docker preview (HTTP)
curl http://carestead.com:8080/api/health

# Docker preview (HTTPS)
curl https://carestead.com:8083/api/health
```

Expected response: `200 OK`

**Note**: The health check container probe runs on HTTP port 8080 for compatibility.

---

## Configuration

### .dev.vars Format

The `web/.dev.vars` file controls both development and Docker environments:

```env
# Calendar integration
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_secret
GOOGLE_REDIRECT_URI=https://carestead.com:8080/api/calendar/callback
GOOGLE_TOKEN_KEY=random_32_hex_chars

# Browser notifications
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:admin@carestead.com

# Email notifications
RESEND_API_KEY=your_api_key
NOTIFICATION_EMAIL_FROM="Carestead <noreply@carestead.com>"

# SMS notifications
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+15551234567
```

**Note**: Leave blank to disable optional integrations.

---

## Build & Test

### Build Verification
```bash
make check       # Runs linter and build
make build       # Build for production
```

### Run Tests
```bash
make test                    # Accessibility tests
make test-notifications      # Notification adapter tests
make test-config            # Deployment config validation
```

---

## Troubleshooting

### Certificate Issues

**Error**: "UNSAFE_LEGACY_RENEGOTIATION_DISABLED"

Solution: Certificates need regeneration.
```bash
# Remove old certificates
rm web/.certs/*.pem

# Run dev server to auto-generate
make dev
# Then stop (Ctrl+C) and try again
```

### Port Already in Use

**Docker HTTP (8080)**: 
```bash
# Find and stop conflicting process
lsof -i :8080
kill -9 <PID>

# Or use different port
HTTP_PORT=9000 make up
```

**Docker HTTPS (8083)**:
```bash
# Find and stop conflicting process
lsof -i :8083
kill -9 <PID>

# Or use different port
HTTPS_PORT=9083 make up
```

**Both ports**:
```bash
HTTP_PORT=9000 HTTPS_PORT=9083 make up
```

**Dev Server**: Port 5173 in use
```bash
# Vite will try next available port automatically
# Or specify custom port:
cd web && npm run dev -- --port 5174
```

### Database Connection Issues

**Fresh start**:
```bash
make down
docker volume rm carestead-data 2>/dev/null
make local-init
make up
```

**Check volume**:
```bash
docker compose -f compose.local.yaml logs web | tail -20
```

---

## Port Configuration

### Local Development
- **HTTP**: Not recommended (Vite dev uses HTTPS)
- **HTTPS**: https://carestead.com:5173

### Docker Preview
- **HTTP**: http://carestead.com:8080
- **HTTPS**: https://carestead.com:8083

### Production
- **HTTP**: Redirects to HTTPS
- **HTTPS**: https://carestead.com (port 443)

## Protocol & Hostname Consistency

| Environment | Hostname | HTTP Port | HTTPS Port | Access URLs |
|---|---|---|---|---|
| Local Dev | carestead.com | N/A | 5173 | https://carestead.com:5173 |
| Docker | carestead.com | 8080 | 8083 | http://carestead.com:8080 or https://carestead.com:8083 |
| Production | carestead.com | 80 → 443 | 443 | https://carestead.com |

**All environments use**:
- ✓ Same hostname: `carestead.com` (requires /etc/hosts: `127.0.0.1 carestead.com`)
- ✓ Same configuration format: `web/.dev.vars`
- ✓ Same database schema
- ✓ Dual port support: HTTP (8080) and HTTPS (8083) in Docker

---

## Next Steps

After local setup works:
1. Run tests: `make test`
2. Verify health: `curl https://carestead.com:8080/api/health`
3. Check logs: `make logs`
4. Deploy to production: See `docs/deployment.md`

---

## References

- Makefile: Development commands
- compose.local.yaml: Docker configuration
- web/vite.config.ts: Build & server setup
- web/.dev.vars.example: Configuration template
- web/.openai/hosting.json: Hosting platform config
