# GitHub Configuration Setup

## Overview

This document explains how to set up GitHub repository variables and secrets required for CI/CD deployment to Cloudflare.

## Automated Setup (Recommended)

Use the provided setup script to automate configuration:

```bash
./scripts/setup-github-config.sh
```

**Requirements:**
- GitHub CLI (`gh`) installed: https://cli.github.com
- Authenticated with GitHub: `gh auth login`
- Repository write access

**What the script does:**
1. ✅ Prompts for Cloudflare credentials
2. ✅ Sets GitHub repository variables (non-sensitive)
3. ✅ Sets GitHub repository secrets (sensitive)
4. ✅ Verifies configuration

## Manual Setup

If you prefer to set values manually via GitHub web UI:

1. Go to your repository → **Settings → Secrets and variables → Variables**
2. Add these **repository variables**:

| Variable | Value | Example |
|----------|-------|---------|
| `CLOUDFLARE_D1_DATABASE_ID` | Your D1 database UUID | `f14ec851-7d05-4fb0-8db0-1874d86caeec` |
| `CLOUDFLARE_D1_DATABASE_NAME` | Database name | `carestead` |
| `CLOUDFLARE_WORKER_NAME` | Worker name | `carestead` |

3. Go to **Settings → Secrets and variables → Secrets**
4. Add these **repository secrets**:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token (with D1 permissions) |

## Finding Your Values

### Cloudflare Account ID
```bash
# Via Cloudflare CLI
wrangler whoami

# Or manually in Cloudflare Dashboard:
# Account Home → Right sidebar → Your account
```

### Cloudflare API Token
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create token with scopes:
   - Cloudflare Workers Scripts (Edit)
   - D1 (Edit)
3. Copy the token

### D1 Database ID
```bash
# Via Wrangler CLI
wrangler d1 list

# Or check: web/wrangler.deploy.json
```

## Verification

After setup, verify configuration is correct:

```bash
# Check variables
gh variable list

# Check secrets are set (won't show values)
gh secret list

# Expected output should show:
# CLOUDFLARE_API_TOKEN
# CLOUDFLARE_ACCOUNT_ID
# CLOUDFLARE_D1_DATABASE_ID
# CLOUDFLARE_D1_DATABASE_NAME
# CLOUDFLARE_WORKER_NAME
```

## Deployment

Once configured, the CI/CD pipeline will automatically:

1. **On every push to main:**
   - Build and validate the bundle
   - Apply database migrations
   - Deploy to Cloudflare Workers

2. **Manual trigger:**
   ```bash
   gh workflow run deploy.yml -r main
   ```

3. **View deployment:**
   ```bash
   gh run list --workflow=deploy.yml
   gh run view <run-id>
   ```

## Troubleshooting

### `CLOUDFLARE_D1_DATABASE_ID` not found

**Error:** `Set CLOUDFLARE_D1_DATABASE_ID to the UUID of your production D1 database.`

**Fix:**
1. Verify the variable is set: `gh variable list`
2. Re-run setup script or manually add the variable
3. Trigger deployment again: `git push origin main`

### Authentication failed

**Error:** `Error: Not authenticated with GitHub CLI.`

**Fix:**
```bash
gh auth login
# Follow prompts to authenticate
```

### API token permissions

**Error:** Deployment fails with 401/403 errors

**Fix:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Verify token has:
   - ✓ Cloudflare Workers Scripts (Edit)
   - ✓ D1 (Edit)
3. Regenerate token if needed

## Security Notes

- **Secrets:** Never commit API tokens or sensitive credentials to git
- **Variables:** Non-sensitive config (IDs, names) are safe in variables
- **Rotation:** Rotate API tokens periodically
- **Audit:** Check GitHub audit log for secret access

## See Also

- [Deployment Guide](deployment.md)
- [Cloudflare Wrangler Docs](https://developers.cloudflare.com/workers/cli-wrangler/)
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
