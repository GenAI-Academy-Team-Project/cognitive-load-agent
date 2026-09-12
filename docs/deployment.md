# Local and Cloudflare deployment

External services are optional and start off. After adding credentials and
restarting the local app (or uploading cloud secrets), sign in as a care-circle
owner and open **Integrations**. Enable the services you want to use. Switches
are saved in D1 and apply to the whole care circle. Existing deployments also
start off until an owner enables them; saved connections and preferences remain.
Missing credentials keep a switch unavailable. Local tasks, trusted facts, chat,
and in-app notifications remain usable. These switches do not replace recipient
consent, Google account connection, delivery opt-in, or action approval. Pausing
Mem0 does not delete remote facts; its existing privacy cleanup remains available.


Carestead uses Cloudflare Workers and D1 directly. There are two deployment paths:

| Purpose | Configuration | Runtime settings | Command |
| --- | --- | --- | --- |
| Local Docker preview | `Dockerfile.local`, `compose.local.yaml` | `web/.dev.vars` | `make up` |
| Local development with HMR | `web/vite.config.ts` | `web/.dev.vars` | `make dev` |
| Cloudflare Workers + managed D1 | `web/wrangler.example.json` → generated `web/wrangler.deploy.json` | Remote Worker secrets, uploaded from `web/.secrets.cloudflare` or CI | `make cloud-release` |

There is one Dockerfile and one Compose file, both for local preview. Cloudflare
runs the app natively; it does not consume Docker Compose. Cloudflare Containers
would require a routing Worker, Durable Object, and a replacement for the local
emulated D1 storage on ephemeral disk. See [Containers setup](https://developers.cloudflare.com/containers/get-started/)
and [disk lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/).

## Local setup

Use Node 22.13+ and Docker Engine/Desktop with Compose v2 or newer.
From the repository root:

```sh
make local-init
# Optionally fill in web/.dev.vars for integrations.
make up
# http://localhost:3000
make logs
make down
```

`make up` also runs `local-init`, which copies the blank template only if the file
is missing. It never overwrites an existing file. All integrations are optional.
The single Compose file mounts `.dev.vars` read-only at runtime and persists local
D1 in `carestead-data`. `make down` preserves that volume. The app initializes and
seeds local tables on first use. The container runs as an unprivileged user and
checks `/api/health`. Set `PORT=3001 make up` to change the host port; it remains
bound to loopback. Update your local Google callback if you change that port.

After changing credentials, run `make up` to recreate/rebuild the preview. For
Compose directly, run `make local-init` first, then
`docker compose -f compose.local.yaml up --build -d --wait`. The bind mount refuses
to create a directory when the settings file is missing.

For development without Docker, use `make install`, `make local-init`, then
`make dev`. Restart the development server after changing runtime settings.
Docker and host development have separate local database stores.

## Where settings and secrets belong

| File or location | Contents | Consumer |
| --- | --- | --- |
| `web/.dev.vars` | Local Google, email, SMS, push, and memory bindings | Local Vite/Wrangler and Docker only |
| `web/.env.cloudflare` | D1 database UUID/name, Worker name, optional account ID | Cloud configuration generator |
| `web/.secrets.cloudflare` | Production integration bindings | Explicit `cloud-secrets-check` / `cloud-secrets-apply` only |
| Shell or GitHub environment secrets | `CLOUDFLARE_API_TOKEN` for deployment authentication | Wrangler; browser login is an alternative locally |
| Cloudflare Worker secret store | Uploaded production runtime values | Deployed app |

Copy the corresponding `.example` files when setting up an environment. Actual
settings and secrets are ignored by Git and excluded from the Docker build
context. The cloud build excludes the local `.dev.vars` preview artifact. Never
put credentials in `VITE_*`, `NEXT_PUBLIC_*`, Docker build arguments, or Wrangler
`vars`. Runtime secrets are not needed to build the app. Cloudflare authentication
credentials are not app runtime bindings.

Configure all values for a desired integration, or leave that entire group blank:

| Integration | Runtime bindings |
| --- | --- |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_KEY` |
| Resend email | `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Pushover mobile app | `PUSHOVER_API_TOKEN` (caregivers enter their own user keys in Notifications) |
| Browser push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| External memory | `MEM0_API_KEY` |

For local Google OAuth use `http://localhost:3000/api/calendar/callback`; for cloud
use `https://YOUR_HOST/api/calendar/callback`. Register each exact URI in Google.
Use separate local and cloud credentials where possible. Generate the token key
once per environment with `openssl rand -hex 32` and retain it across releases;
changing it makes existing Calendar tokens unreadable. Keep VAPID keys stable too.
There is no shared session secret: sessions are backed by D1.

## First Cloudflare deployment

From the repository root:

```sh
make install
make cloud-login
make cloud-db-create  # Once; skip if the target database already exists.
cp web/.env.cloudflare.example web/.env.cloudflare
```

Put the returned database UUID in `.env.cloudflare`. The default Worker and database
name is `carestead`. For another database name, create it with
`cd web && npx wrangler d1 create YOUR_NAME` and set the matching name/UUID in the
file. For multiple accounts, select the intended account when creating the
resource and set `CLOUDFLARE_ACCOUNT_ID` in the file for subsequent operations.
Shell/CI settings override saved cloud configuration values.

```sh
make cloud-check    # Build and Wrangler dry run; no publishing.
make cloud-release  # Validate, migrate remote D1, publish the same bundle.
```

`cloud-release` stops if any step fails. The published config is
`web/dist/server/wrangler.json`. Never publish a local build: it uses a placeholder
D1 ID. Release/migration commands reject the CI dummy UUID. Subsequent releases
use the same `make cloud-release` command. `make deploy` builds and publishes only;
it is available when migrations have already been applied.

Apply migrations before the first request. If an older database was initialized
by app bootstrap without a migration ledger, back it up and reconcile/baseline it
before applying migrations: the SQL uses `CREATE TABLE`. Fresh databases can use
the sequence above. Worker rollback does not roll back D1; handle database recovery
separately. Use separate Worker names and D1 databases for staging and production.

Check `/api/health` at the HTTPS URL printed by Wrangler, then create the owner
account immediately: the first registered account owns the shared care circle.
Later accounts require invitations. The app still seeds demo records and remains
a prototype; deployment does not change those behaviors.

## Cloud runtime secrets

For optional integrations, copy the cloud template once and fill in complete groups:

```sh
cp web/.secrets.cloudflare.example web/.secrets.cloudflare
make cloud-secrets-check
# After the Worker has been deployed:
make cloud-secrets-apply
```

Validation is local and prints no values. Upload regenerates the target from
`.env.cloudflare`, rejects placeholder databases, and passes only supported runtime
bindings through stdin to Wrangler. It never uploads `.dev.vars`, deployment IDs,
or API tokens. The validator checks group completeness and basic formats; provider
credentials and permissions still need an end-to-end acceptance check.

Blank or omitted values preserve existing remote secrets; they do not disable an
integration. To remove a remote setting explicitly, from `web` run
`npx wrangler secret delete NAME --config wrangler.deploy.json` for each binding in
that group. A normal app release preserves existing remote secrets. See
[Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
and [bulk secret behavior](https://developers.cloudflare.com/changelog/post/2026-06-03-bulk-secrets-api/).

Provider setup: [Google Calendar](google-calendar-setup.md),
[notifications](notification-setup.md), and [memory](memory-pilot.md).

## GitHub Actions

`Container and cloud build` tests the configuration helpers, validates a cloud
bundle with a dummy D1 UUID, builds the local Docker image, and smoke-tests it.
The accessibility workflow continues to test browser behavior.

`Deploy Cloudflare` is manually dispatched and uses the GitHub `production`
environment. Configure:

- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Variable: `CLOUDFLARE_D1_DATABASE_ID`.
- Optional variables: `CLOUDFLARE_WORKER_NAME`, `CLOUDFLARE_D1_DATABASE_NAME`.
- Optional runtime secrets: complete integration groups from the table above.

Use a token with Workers Scripts edit and D1 edit permissions for the target
account. Select **Upload configured runtime secrets after deployment** only when
uploading integration settings. The workflow validates them before migration and
publishing, then uploads them after deployment. Leave it unchecked for ordinary
releases that should preserve remote settings. No local secret file is needed in CI.

## Migrating the previous file layout

The feature-specific Compose overrides have been removed. Use `make up`, or
`docker compose -f compose.local.yaml ...`; `up-integrations` is no longer needed.
`Dockerfile.local` replaces `Dockerfile`. The existing named database volume is
preserved because the Compose project directory and volume key are unchanged.

The Calendar and notification examples have been replaced with one local template
and one cloud runtime template. Existing `web/.dev.vars` works unchanged. Merge
any values in an old `.env.calendar.deploy` into `.secrets.cloudflare` yourself;
keep that file private and remove the obsolete copy when finished. The old file
is no longer loaded. `cloud-secrets-check` and `cloud-secrets-apply` replace the
Calendar-only commands. `docs/deployment.md` is the sole deployment guide.
