# Deploying a public FocusFlow

A FocusFlow reachable from the internet over https — for Google Play's
reviewers, or just for you away from home. One VPS, one domain, one command.

`docker-compose.prod.yml` puts **Caddy** in front (automatic Let's Encrypt),
keeps **Postgres unreachable from outside**, and starts with **sign-up closed**.
Everything below assumes that file.

## 0. What you need

- A VPS with ports **80 and 443** open to the internet. Any 1 vCPU / 1 GB box
  is enough. Docker with the compose plugin installed on it.
- A domain (or subdomain) you control — `focusflow.example.com` below.
- Images on Docker Hub. The web repo's CI publishes `focusflow` and
  `focusflow-migrate` on every `vX.Y.Z` tag, or build them yourself:
  ```bash
  docker build -t YOU/focusflow:local .
  docker build --target builder -t YOU/focusflow-migrate:local .   # same Dockerfile, builder stage
  ```
  and set `IMAGE_TAG=local`.

## 1. DNS

An **A record** for `focusflow.example.com` → the VPS's public IP. Wait until
`dig +short focusflow.example.com` answers with it from the VPS itself — Caddy
cannot obtain a certificate before then, and the failure is a loop of
`obtaining certificate` lines rather than a clear error.

## 2. Configure

On the VPS, you only need three files from the repo:

```bash
mkdir focusflow && cd focusflow
curl -fsSLO https://raw.githubusercontent.com/senafathoni2998/FocusFlow/main/docker-compose.prod.yml
curl -fsSLO https://raw.githubusercontent.com/senafathoni2998/FocusFlow/main/Caddyfile
curl -fsSL  https://raw.githubusercontent.com/senafathoni2998/FocusFlow/main/.env.prod.example -o .env.prod
```

Edit `.env.prod`. The compose file **refuses to start** until these are set,
naming the missing one:

| Variable | Value |
|---|---|
| `DOMAIN` | `focusflow.example.com` — Caddy serves and certifies exactly this; `NEXTAUTH_URL` is derived from it |
| `DOCKERHUB_USERNAME` | whose images to pull |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `ALLOW_SIGNUP` | leave `false` — see step 4 |

`GROQ_API_KEY` is optional (the assistant and insights need it; everything else
does not). The `VAPID_*` / `CRON_SECRET` block is for background web push and is
optional too — see the README.

## 3. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

`migrate` runs the Prisma migrations and exits; `app` waits for it, then for its
own health check; `caddy` waits for `app` to be healthy before it accepts a
connection. When `ps` shows `app` as `healthy` and `caddy` as `running`:

```bash
curl -s https://focusflow.example.com/api/health      # → {"ok":true,"db":true}
```

The first request to a new domain can take ~10 s while Caddy fetches the
certificate.

## 4. Create the reviewer (or your own) account, then close the door

Sign-up is closed on a public instance so strangers cannot register. Open it
for the minute it takes:

```bash
sed -i 's/^ALLOW_SIGNUP=.*/ALLOW_SIGNUP=true/' .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d app
```

Visit `https://focusflow.example.com/auth/signup`, create the account, then:

```bash
sed -i 's/^ALLOW_SIGNUP=.*/ALLOW_SIGNUP=false/' .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d app
```

From now on both `/auth/signup` and the mobile register endpoint answer
`403 This server is not accepting new accounts.` Existing accounts sign in as
normal. Put the account's email and password into Play Console → **App access**.

## 5. Point the phone at it

FocusFlow Mobile → Settings → Server URL → `https://focusflow.example.com`.
No cleartext exceptions needed: it is https, which every build type allows.

## 6. Background web push (optional)

```bash
npm run push:keys            # in the repo; paste the three lines into .env.prod
echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile push up -d
```

The `push` profile adds a one-line sidecar that calls the dispatcher every
minute — the "external scheduler" the README says nothing inside Next.js can be.
Without the profile, the reminder path behaves exactly as before.

## Updating

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.2.0/' .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

`migrate` runs again on every `up`; it is a no-op when there is nothing new.

## Backups

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U focusflow focusflow | gzip > focusflow-$(date +%F).sql.gz
```

Postgres is not published to the host, so this — `exec` inside the container —
is the way in. Every user can also export their own account as JSON from
Settings.

## When it fails

| Symptom | Cause |
|---|---|
| `caddy` logs loop on `obtaining certificate` | DNS not pointing at this box yet, or port 80 blocked (the ACME challenge needs it) |
| `curl …/api/health` → `{"ok":false,"db":false}` (503) | app is up, Postgres is not — `docker compose logs postgres` |
| Caddy answers 502 | app not healthy yet (first boot ~20 s), or it crashed — `docker compose logs app` |
| compose refuses to start: `set DOMAIN in .env.prod` | exactly that |
| sign-up page says "not accepting new accounts" | intended — step 4 |
