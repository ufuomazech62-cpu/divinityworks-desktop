# Divinity Works — self-hosted backend deployment

This folder holds the deployment artifacts for the **Divinity Works** backend.
It is the "Chapter 2" SaaS step: our own hosted backend, built from the
Rowboat codebase but rebranded and pointed at *our* providers.

## What runs where

| Layer        | Provider                              | Notes |
|--------------|---------------------------------------|-------|
| Compute      | Oracle Cloud Free Tier VM (us-phoenix-1) | Docker host. Only SSH + Cloudflare Tunnel egress. |
| Ingress      | Cloudflare Tunnel                     | Zero open ports. No `ports:` published in compose. |
| Storage      | Cloudflare R2 (S3-compatible)         | Uploads / RAG files. |
| Database     | MongoDB (container)                   | Internal network only. |
| Cache/queue  | Redis (container)                     | Quotas, pub/sub. |
| Vector (RAG) | Qdrant (container)                    | Internal network only. |
| LLM          | OpenRouter — `tencent/hy3:free`       | OpenAI-compatible endpoint. |
| Auth         | Auth0 + Google social connection      | Zero code change vs Rowboat. |
| Billing      | Stripe (optional, off by default)     | Guest mode until wired. |
| CI/CD        | GitHub Actions (private repos)        | Build & deploy on push. Secrets live in Actions, never in git. |

## Files

- `docker-compose.yml` — the full stack (app + cloudflared + mongo + redis + qdrant + workers).
- `.env.example` — every variable the stack needs. Copy to `.env`, fill in, gitignore it.

## Deploy flow (once Oracle VM is ready)

1. `git clone` the `divinityworks-backend` repo on the Oracle VM.
2. `cp .env.example .env` and fill values (from Cloudflare Secrets Store / GitHub Actions secrets).
3. `docker compose --profile rag-worker up -d` (after first `docker compose run --profile setup_qdrant setup_qdrant`).
4. Cloudflare Tunnel (`CLOUDFLARED_TUNNEL_TOKEN`) exposes `api.divinityworks.ai`.

## Secrets policy

- No real secrets are ever committed.
- GitHub Actions secrets hold CI deploy credentials.
- Cloudflare Secrets Store / Tunnel token hold runtime secrets.
- `.env` is gitignored everywhere.
