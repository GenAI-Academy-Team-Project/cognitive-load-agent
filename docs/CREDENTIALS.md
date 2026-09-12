# Credential & Secret Management

This document outlines how Carestead handles sensitive information to prevent accidental commits of credentials.

## Protected Files & Patterns

### Root `.gitignore` Rules

The following sensitive files are **never** committed:

#### Environment & Configuration
- `*.env*` files (except `.env.cloudflare.example`)
- `*.dev.vars*` files (except `.dev.vars.example`)
- `*.secrets*` files (except `.secrets.cloudflare.example`)
- `.certs/` directory (certificates and private keys)

#### Certificate Files
- `*.pem` (except examples)
- `*.key` (except examples)
- `*.crt`, `*.cert` (certificate formats)

#### Credential JSON Files
- `credentials.json`
- `secrets.json`
- `api-keys.json`
- `tokens.json`
- `*.credentials`
- `*.credentials.json`

#### Local Configuration
- `config.local.*`
- `*.local.json`

## Configuration Template Files

These **are** committed as examples (safe, no real credentials):

- `.env.cloudflare.example` → Copy to `.env` locally
- `.dev.vars.example` → Copy to `.dev.vars` locally
- `.secrets.cloudflare.example` → Copy to `.secrets` locally

All template files have **empty values**. Replace them with real values locally only.

## Credential Types

### Local Development (`.dev.vars`)

```env
# Google Calendar
GOOGLE_CLIENT_ID=                    # Empty - fill locally only
GOOGLE_CLIENT_SECRET=                # Empty - fill locally only
GOOGLE_REDIRECT_URI=                 # Empty - fill locally only
GOOGLE_TOKEN_KEY=                    # Empty - fill locally only

# Browser Push Notifications
VAPID_PUBLIC_KEY=                    # Empty - fill locally only
VAPID_PRIVATE_KEY=                   # Empty - fill locally only
VAPID_SUBJECT=                       # Empty - fill locally only

# Email Notifications
RESEND_API_KEY=                      # Empty - fill locally only
NOTIFICATION_EMAIL_FROM=             # Empty - fill locally only

# SMS Notifications
TWILIO_ACCOUNT_SID=                  # Empty - fill locally only
TWILIO_AUTH_TOKEN=                   # Empty - fill locally only
TWILIO_FROM_NUMBER=                  # Empty - fill locally only
```

**Protection**: `.gitignore` prevents `.dev.vars` from being committed. Only `.dev.vars.example` is tracked.

### Cloud Deployment (GitHub Secrets)

Sensitive credentials are stored in **GitHub Organization Secrets**, not in files:

- `CLOUDFLARE_API_TOKEN` → Used by CI/CD workflows
- `CLOUDFLARE_D1_DATABASE_ID` → Used by deployment scripts
- Other API keys → Stored as GitHub secrets

**Protection**: Referenced in CI/CD as `${{ secrets.SECRET_NAME }}`, never hardcoded.

### Certificates (`.certs/`)

HTTPS certificates for local development:

- `web/.certs/carestead.pem` (certificate)
- `web/.certs/carestead-key.pem` (private key)

**Protection**: `.gitignore` prevents these from being committed.

**Generation** (local only):
```bash
brew install mkcert
mkcert -install
mkdir -p web/.certs
mkcert -cert-file web/.certs/carestead.pem -key-file web/.certs/carestead-key.pem carestead.com localhost 127.0.0.1 ::1
```

## Workflow

### First Time Setup

```bash
# 1. Clone repo
git clone https://github.com/GenAI-Academy-Team-Project/cognitive-load-agent.git
cd cognitive-load-agent

# 2. Create local config (DO NOT commit)
make local-init          # Creates .dev.vars from .dev.vars.example
# Edit .dev.vars with your local API keys

# 3. Create certificates (DO NOT commit)
mkdir -p web/.certs
mkcert -cert-file web/.certs/carestead.pem -key-file web/.certs/carestead-key.pem carestead.com localhost 127.0.0.1 ::1

# 4. Verify nothing sensitive is staged
git status               # Should show .dev.vars and .certs/ NOT listed
```

### Daily Development

```bash
# Always check status before committing
git status               # .dev.vars should NOT be in "Changes to be committed"
git diff                 # .dev.vars should NOT appear

# If you accidentally staged .dev.vars
git restore --staged .dev.vars
```

### Before Committing Code

```bash
# Double-check no credentials are staged
git status               # Should NOT include:
                         #   .dev.vars, .env*, .secrets*, .certs/

# Review diff one more time
git diff --cached        # Should NOT show API keys or tokens
```

## If You Accidentally Commit Credentials

**Immediately**:

1. **Stop** - Don't push yet
2. **Remove** - Remove from Git history:
   ```bash
   git reset HEAD~1                    # Undo the commit
   git restore .dev.vars               # Restore from .gitignore
   ```
3. **Add to .gitignore** - Ensure pattern is added
4. **Recommit** - Without the sensitive file

**If Already Pushed**:

1. **Invalidate** - Rotate any exposed credentials immediately
2. **Notify** - Tell repository maintainers
3. **Remove from History**:
   ```bash
   git filter-branch --tree-filter 'rm -f .dev.vars' -- --all
   git push --force-with-lease
   ```
4. **Add to .gitignore** - Prevent future commits

## Verification

To verify no credentials are tracked:

```bash
# Check for common patterns
git ls-files | xargs grep -l 'API_KEY\|SECRET\|TOKEN' | grep -v example

# Check for sensitive file types
git ls-files | grep -E '\.(pem|key|crt|cert|env|dev\.vars|secrets)$' | grep -v example

# List .gitignore rules
cat .gitignore | grep -v '^#' | grep -v '^$'
```

## CI/CD Secrets Management

GitHub Actions workflows use repository secrets:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      # ✓ SAFE - References GitHub secret
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    steps:
      - name: Deploy
        run: make cloud-release
```

Secrets are:
- ✓ Stored in GitHub Settings → Secrets
- ✓ Masked in logs (showing `***`)
- ✓ Never printed to console
- ✓ Only available to authorized workflows

## Tools & Best Practices

### Pre-commit Hooks (Optional)

Consider using `pre-commit` framework to catch credentials automatically:

```bash
pip install pre-commit

# Add to .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: detect-private-key
      - id: detect-aws-credentials
```

### Secret Scanning

GitHub's built-in Secret Scanning will notify if patterns matching common secrets are detected (AWS keys, GitHub tokens, etc.)

## References

- [GitHub: Keeping your credentials safe](https://docs.github.com/en/code-security/secret-scanning/protecting-pushes-with-secret-scanning)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Pre-commit: Detect Private Key Hook](https://github.com/pre-commit/pre-commit-hooks#detect-private-key)

---

**TL;DR**: 
- ✓ Credentials go in `.dev.vars` (local, never committed)
- ✓ Templates go in `.dev.vars.example` (committed, empty values)
- ✓ Certificates go in `.web/.certs/` (local, never committed)
- ✓ CI/CD uses GitHub Secrets, never hardcoded values
- ✓ Always check `git status` before committing
