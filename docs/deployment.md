# Carestead Deployment & Development Guide

## Overview

Carestead runs on two environments during development and testing:
- **Local Development**: Direct Vite dev server on HTTPS (carestead.com:8083)
- **Docker Preview**: Wrangler Workers emulation with dual ports (HTTP:8080, HTTPS:8083)

Both environments use the same hostname (`carestead.com`) and configuration format for consistency.

**Quick Setup**:
```bash
make host-config  # One-time: configure /etc/hosts
make install      # One-time: install dependencies
make dev          # Local: https://carestead.com:8083
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

### What is Local Development?

Local development runs the **Vite dev server** directly on your machine (not in Docker). This is for rapid development with hot module reloading.

- **When to use**: During active development (fastest feedback loop)
- **Port**: 8083 for HTTPS; 8080 for HTTP
- **Database**: Local persisted D1 in `web/.wrangler` (tests use isolated databases)
- **Performance**: Fast HMR and instant page reloads

### Start Development Server

```bash
make install     # First time: install locked dependencies
make dev         # Start Vite dev server
```

**Access**: https://carestead.com:8083

**Note**: The local launcher uses the same ports for development and Docker: 8083 for HTTPS, and 8080 for HTTP. With certificates installed, HTTP redirects to HTTPS.

### Features
- Hot module replacement (HMR) - see changes instantly
- HTTPS with local certificates
- Local persisted D1 database
- Real-time code updates
- Faster feedback than Docker for active development

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

### Port Requirements

⚠️ **Important**: The Docker container requires these specific ports to be available:
- **HTTP**: Port 8080 (required, no fallback)
- **HTTPS**: Port 8083 (required, no fallback)

If these ports are in use, startup will **fail with an error message** showing which process is using them and instructions to free the port. You must resolve the port conflict before restarting.

### Start Docker Container

```bash
make host-config # Configure /etc/hosts with carestead.com (one-time, may prompt for password)
make local-init  # Create .dev.vars (one-time, non-destructive)
make up          # Build and start Docker container
```

The `make up` command will:
1. Check /etc/hosts configuration
2. Verify port availability (8080, 8083)
3. Create .dev.vars if needed
4. Build and start the container

**Access**:
- HTTP: http://carestead.com:8080
- HTTPS: https://carestead.com:8083

### Container Details
- **Image**: carestead:local
- **Ports** (fixed, non-negotiable):
  - 8080 → HTTP-to-HTTPS redirect, or direct HTTP without certificates
  - 8083 → HTTPS when certificates are present
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
curl https://carestead.com:8083/api/health

# Docker preview (HTTP)
curl -L http://carestead.com:8080/api/health

# Docker preview (HTTPS)
curl https://carestead.com:8083/api/health
```

Expected response: `200 OK`

**Note**: The container probe follows the HTTP redirect to the HTTPS health endpoint when TLS is enabled. Its HTTPS trust bypass is confined to the loopback health probe.

---

## Configuration

### .dev.vars Format

The `web/.dev.vars` file controls both development and Docker environments:

```env
# Calendar integration
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_secret
GOOGLE_REDIRECT_URI=https://carestead.com:8083/api/calendar/callback
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

The launcher loads existing certificates; it does not generate them. Install
[mkcert](https://github.com/FiloSottile/mkcert) and create a trusted local pair. On
macOS, from the repository root:

```bash
brew install mkcert
mkcert -install
mkdir -p web/.certs
mkcert -cert-file web/.certs/carestead.pem -key-file web/.certs/carestead-key.pem carestead.com localhost 127.0.0.1 ::1
```

Restart after replacing certificates. Docker mounts them read-only; keys stay out
of the image. With both files present, development and Docker use HTTPS on 8083,
and HTTP on 8080 redirects with status 307 while preserving the method and path.
The redirect is not cached, so changing protocols does not leave a permanent
browser redirect behind. Without the pair, the main server uses HTTP on 8080.
To explicitly use HTTP while retaining the files, run `CARESTEAD_HTTPS=0 make dev`
or `CARESTEAD_HTTPS=0 make up`.

### Origin configuration and 403 errors

Set `AUTH_PUBLIC_URL` in `web/.dev.vars` to the exact main browser origin:
`https://carestead.com:8083` for HTTPS, or `http://carestead.com:8080` in HTTP mode.
Restart after changing bindings. For cloud deployment, put the public HTTPS origin
in `web/.secrets.cloudflare`; `make cloud-secrets-apply` uploads it. The deployment
workflow also accepts `AUTH_PUBLIC_URL` from GitHub environment secrets.

Authentication and all membership-protected API mutations validate Origin against
the request URL or `AUTH_PUBLIC_URL`. This supports TLS termination in front of
the Worker without trusting arbitrary forwarding headers. Missing, opaque,
cross-site, and mismatched-port origins remain rejected. A 403 saying **Open
Carestead in this browser and try again.** indicates an origin mismatch; other
403 messages may indicate missing recipient access or insufficient permissions.

Open the main URL and sign in before making API requests. Browser POSTs should go
directly to that origin; following an HTTP-to-HTTPS redirect can lose Origin or
session information. Match `GOOGLE_REDIRECT_URI` to the same origin followed by
`/api/calendar/callback`.

Run the focused regression suites from `web`, using unused test ports:

```bash
CARESTEAD_TEST_PORT=43429 npx playwright test --config playwright.navigation-api.config.ts
CARESTEAD_TEST_HTTPS=1 CARESTEAD_TEST_PORT=43439 npx playwright test --config playwright.navigation-api.config.ts
npx playwright test --config playwright.unit.config.ts session-origin.spec.ts
```

These tests use isolated databases and generated non-secret `.dev.vars.review-*`
files, not the real integration bindings. HTTPS tests require the certificate pair
and bypass local trust only in the test client. They verify navigation, all API
route families, representative writes, and origin rejection. They do not send
provider messages or complete a real Google OAuth flow.

### Port Already in Use

The startup process will **fail** if required ports (8080 for HTTP, 8083 for HTTPS) are unavailable. You must free these ports before restarting.

**To resolve**:

```bash
# 1. Identify process using the port
lsof -i :8080              # Check HTTP port
lsof -i :8083              # Check HTTPS port

# 2. Kill the conflicting process
kill -9 <PID>

# 3. Or stop the existing Docker container
make down                   # Gracefully stops container and frees ports

# 4. Restart on defined ports
make up                     # Must use defined ports (8080, 8083)
```

**Important**: The service **will not** start on alternative ports. The defined ports (8080, 8083) must be available for startup to proceed. This ensures consistency across all environments.

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
- **HTTPS**: https://carestead.com:8083

### Docker Preview
- **HTTP**: http://carestead.com:8080
- **HTTPS**: https://carestead.com:8083

### Production
- **HTTP**: Redirects to HTTPS
- **HTTPS**: https://carestead.com (port 443)

## Protocol & Hostname Consistency

| Environment | Hostname | HTTP Port | HTTPS Port | Access URLs |
|---|---|---|---|---|
| Local Dev | carestead.com | 8080 → 8083 | 8083 | https://carestead.com:8083 |
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
2. Verify health: `curl https://carestead.com:8083/api/health`
3. Check logs: `make logs`
4. Deploy to production: See `docs/deployment.md`

---

## References

- Makefile: Development commands
- compose.local.yaml: Docker configuration
- web/vite.config.ts: Build & server setup
- web/.dev.vars.example: Configuration template
- web/.openai/hosting.json: Hosting platform config
