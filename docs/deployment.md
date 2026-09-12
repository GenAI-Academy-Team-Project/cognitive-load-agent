# Carestead Deployment & Development Guide

## Overview

Carestead runs on two environments during development and testing:
- **Local Development**: Direct Vite dev server (HTTPS via carestead.com)
- **Docker Preview**: Wrangler Workers emulation with D1 database

Both environments use the same hostname (`carestead.com`), protocol (HTTPS), and configuration format for consistency.

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
make local-init  # Create .dev.vars (one-time, non-destructive)
make up          # Build and start Docker container
```

**Access**: https://carestead.com:8080

### Container Details
- **Image**: carestead:local
- **Port**: 8080 (bound to 127.0.0.1)
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

Both environments expose a health check endpoint:

```bash
# Local development
curl https://carestead.com:5173/api/health

# Docker preview
curl https://carestead.com:8080/api/health
```

Expected response: `200 OK`

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

**Docker**: Port 8080 in use
```bash
# Find and stop conflicting process
lsof -i :8080
kill -9 <PID>

# Or use different port
PORT=9000 make up
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

## Protocol & Hostname Consistency

| Environment | Hostname | Port | Protocol | Access URL |
|---|---|---|---|---|
| Local Dev | carestead.com | 5173 | HTTPS | https://carestead.com:5173 |
| Docker | carestead.com | 8080 | HTTPS | https://carestead.com:8080 |
| Production | carestead.com | 443 | HTTPS | https://carestead.com |

**All environments use**:
- ✓ Same hostname: `carestead.com`
- ✓ Same protocol: HTTPS
- ✓ Same configuration format: `web/.dev.vars`
- ✓ Same database schema

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
