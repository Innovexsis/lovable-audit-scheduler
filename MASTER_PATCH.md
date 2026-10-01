# MASTER PATCH v74 — cumulative bundle (includes v71, v72, v73, v74)

Mandatory for the master portal, every sub-portal and every slave portal. Master wins on every conflict. Supersedes v70.


---
# MASTER PATCH v71 — Fleet Reconnect v1 (announce + master self-broadcast)

Mandatory for the master portal, every sub-portal and every slave portal owned by
vivekearthz (vivekearthz@gmail.com). Master wins on every conflict. Supersedes
v70 and keeps every v60-v70 mandate unchanged.

## 1. Every portal announces itself (upstream handshake)

1. Each portal exposes `GET|POST /api/public/portal/announce`, which builds its
   own **connection card** and pushes it, HMAC-signed with `MASTER_SYNC_SECRET`
   (`X-Sync-Signature`), to the master at `/api/public/imsp/announce`.
2. The card carries: `portal_key`, `role`, `patch_version` +
   `patch_version_number`, `agent_version`, `auth` scheme and the portal's
   `endpoints` (`sync_now`, `master_sync`, `version`, `announce`).
3. The master persists the card on `portal_registry`
   (`announce_card`, `webhook_url`, `patch_version_number`, `announced_at`,
   `last_seen_at`) and answers with the **master card**, so a portal whose
   master moved workspace or host re-points on the next cycle with no human step.
4. The announce endpoint is on the auth-bypassed public prefix, so signature
   verification is mandatory and happens before anything is persisted.

## 2. Master self-broadcast (downstream handshake)

1. `master-broadcast-daily` (02:10 UTC) pushes the master card to every
   registered `webhook_url`, signed with the same shared secret.
2. Version comparison stays NUMERIC: portals strictly **behind**
   `FLEET_VERSION_NUMBER` get `refresh_config` + `republish` queued (deduped);
   portals **ahead** are never downgraded.
3. Unreachable portals are retried; after **3** consecutive failures the row is
   marked `stale` and the owner is emailed through the pooled provider ladder.
   Registry rows are never deleted.

## 3. One version constant (restated from v70)

No portal may hard-code a patch/policy version string. The single source of
truth remains `src/lib/fleet-version.ts`
(`FLEET_PATCH_VERSION`, `FLEET_VERSION_NUMBER`), reported by
`/api/public/portal/version`.

## 4. Self-healing

Announce drift, webhook drift and version drift are repaired by the daily
02:30 IST orchestrator plus the 02:10 UTC broadcast, both with retry, backoff
and owner escalation after 3 consecutive failures. No human step is ever
required.

---
# Master Patch v72 — FLEET PROPAGATION v2 (latest-wins fleet registry)

Supersedes FLEET RECONNECT v1 (v71). Mandatory for every portal: main, master,
sub and slave.

## 1. Master fleet registry (latest-wins)

- `public.fleet_registry` (service-role write, admin read): `portal_key`, `role`,
  `manifest`, `patch_version_number`, `tree_hash`, `webhook_url`, `pull_url`,
  `stale`, `drifted`, `generated_at`, `last_seen_at`.
- `POST /api/public/imsp/manifest` — HMAC `X-Sync-Signature`, Zod-validated,
  public path. Rules:
  - upsert by `portal_key`; a manifest older than the stored `generated_at` is
    **ignored** (no out-of-order overwrite),
  - fleet reference = `MAX(patch_version_number)` across the fleet, with the
    master version as the floor — a portal that is ahead becomes the reference
    and is never downgraded (numeric comparison only),
  - portals strictly below the reference are flagged `stale`; portals level with
    the reference but with a different `tree_hash` are flagged `drifted`,
  - response carries `fleet_reference { portal_key, patch_version,
    patch_version_number, tree_hash, pull_url }` + queued `commands`, so the
    caller converges in the same round-trip.
- `GET /api/public/imsp/manifest` returns the current reference (no secrets).

## 2. Daily master broadcast carries the reference

`master-broadcast-daily` (02:10 UTC) now sends `{ master, fleet_reference,
fleet_refresh_cron }`. Portals below the reference get `refresh_config` +
`republish` with the reference `pull_url`.

## 3. Credential / connector refresh distribution

Manifests carry integration **names + configured flag + non-reversible
fingerprint only** — never values. Any portal reporting `configured: false`
receives a `refresh_secrets` command listing names only; the master writes the
fresh values through its own privileged channel after the portal ACKs.

## 4. Shared triple backup

Live copy = master `fleet_registry`. Mirrors: GitHub
`vivekearthz/martech-fleet-registry` (`portals/<portal_key>.json`,
`fleet/reference.json`) and the nightly Google Drive export
(`FLEET_DRIVE_FOLDER_ID`). Recovery order: Supabase → Neon → GitHub → Drive.

## 5. Daily policy on EVERY portal

```
fleet-refresh-daily   20 3 * * *   POST <portal>/api/public/hooks/master-sync {"fleet_refresh": true}
```

Each tick: publish manifest → read reference → if behind/drifted, bootstrap from
master, run two-way sync, request republish with fresh tokens/connectors/code →
write its own `stale` marker. Ahead ⇒ promote itself as the reference.

## 6. Backend sovereignty fallback (carried forward from v68/v69)

Database, auth and storage credentials are read from environment variables only.
No portal hardcodes a Lovable Cloud project; the owned-Supabase migration path
stays a drop-in env swap plus the Neon/GitHub/Drive fallback ladder above.

---
# MASTER PATCH v73 — Fleet convergence (FLEET_MASTER_ACTIONS v5)

Supersedes v72. Master wins on every conflict. Mandatory for the master portal,
every sub-portal and every slave portal owned by vivekearthz@gmail.com.

## 1. Canonical identity

- Canonical master host: `https://my-secret-automagic.lovable.app`
  (repo `vivekearthz/my-secret-automagic-0ad5a80b`), protocol `imsp/v1`.
- The master's `policy.masterIdentityBroadcast` OUTRANKS env and bundled hosts.
- The adopted master host MUST be persisted in the portal's replicated store and
  reloaded on cold boot before the first outbound call.
- Stale `PRODUCT` / `SLAVE_PRODUCT_KEY` env values are ignored; the canonical key
  in `.guardian/identity.json` is what is signed and reported.

## 2. Version discipline (unchanged from v70, restated)

- One version constant per portal: `src/lib/fleet-version.ts`. No literals.
- Comparison is NUMERIC; a portal ahead of the master is never downgraded.
- `/api/public/portal/version` reports the constant.

## 3. Sync contract

- A sync failure MUST NEVER return 500 — always `{ ok: false, retryable: true }`.
- Latest-wins: newest manifest by patch number + timestamp becomes `fleet:latest`;
  older code bases, connectors and keys are marked stale, replaced from the
  shared registry, then the portal republishes itself.
- `GET /api/public/imsp/schema` is published by the master so slaves can validate
  manifest shape before writing to the shared registry.
- Signed channels in force: `imsp/report`, `imsp/patch`, `imsp/announce`,
  `imsp/manifest`, `imsp/backup`.

## 4. Credentials

- Slaves hold NO provider keys. `refresh_secrets` / `rotate_credentials` return
  slot NAMES plus a `configured` flag only. The master fans out fresh values on
  rotation.

## 5. Backups

- Every `imsp/backup` snapshot is replicated to Lovable Cloud/Supabase, the shared
  GitHub registry AND the shared `Structured Database` Google Drive folder, with
  retry + replay of pending mirrors.

## 6. Master-side queue (tracked in roadmap.md)

1. Repo rename `vivekearthz/innedge-flow-d1579426` -> `vivekearthz/innedge-flow`.
2. Higher-budget fleet GitHub token for the shared registry.
3. Onboard Daretolaw, Debugmysoftware.com and
   finance.martech.innedgeconsulting.com as slaves on this bundle.

## 7. New service inheritance

- TrustCheck by Innovexsis (evidence-backed counterparty decisions) is a
  first-class Innovexsis service on the master portal, sharing the master login,
  Razorpay billing, service-desk fulfilment and parity audit. Slaves consume it
  through the shared service catalogue — never a local fork.

---
# Master Patch v74 — Outbound Sovereignty (master-optional delivery)

## Why
Until v73 every slave portal relayed email, WhatsApp and social posts through
the master. A paused master database or an unreachable master stopped all
outbound traffic fleet-wide — a single point of failure.

## Rule
Every portal (main, slave, sub-portal) sends DIRECT TO THE PROVIDER when it
holds that provider's credentials, and falls back to the master relay only
when it holds none or every local provider failed. The master is now an
optional convenience leg, never a dependency.

## Installed into every mapped repo (fleet-force-enroll)
- `src/routes/api/public/hooks/email-send.ts` — direct provider rotation
  (Brevo → MailerSend → SendGrid → Elastic Email), 2 attempts each with
  exponential backoff, transient-only retry, master relay as last resort.
- `src/routes/api/public/hooks/wa-send.ts` — direct Emovur Cloud API send
  (text or template), E.164 validation, 3 attempts with backoff, provider
  message id returned for delivery tracking; master hub as last resort.
- `src/routes/api/public/hooks/social-send.ts` — direct Telegram/Discord post
  where local tokens exist, master social-relay for all other channels,
  per-channel `{ ok, via, error }` result so nothing is silently dropped.

## Invariants
- All three routes are HMAC-signed (`X-Sync-Signature`, `MASTER_SYNC_SECRET`);
  never open relays.
- Permanent (4xx) provider failures stop that provider immediately; only 429
  and 5xx are retried, so allowances are not burned on guaranteed rejections.
- No Lovable AI, Lovable Cloud or Cloudflare paid service is on any of these
  paths.
