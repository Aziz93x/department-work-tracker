# Environment and service bindings

The production environment-variable API returned zero entries at export time (revision 4). No production values, secrets, repository credentials or account data are included.

## Required service bindings

| Name | Type | Supplied value | Configuration |
| --- | --- | --- | --- |
| `DB` | Cloudflare D1 database object | | `.openai/hosting.json`, `wrangler.local.json`, `vite.config.ts` |
| `BUCKET` | Cloudflare R2 bucket object | | `.openai/hosting.json`, `wrangler.local.json`, `vite.config.ts` |

These are service objects, not text variables. Do not set `DB=` or `BUCKET=` in an environment file as a substitute for configuring bindings. Local Wrangler emulates the resources. Cloud resource IDs, credentials and data are not exported.

## Optional scalar variables

The blank names in `.env.example` are overrides used by local tools; they are not required application secrets. `TEST_URL` selects the local test server. `SITES_RUNTIME_ROOT` and the log/registry paths select local tool directories. The other names control telemetry, local Cloudflare metadata fetching, dependency installation or its report location. Leave them **unset** to preserve the defaults in the source. Some code uses nullish fallback, so loading an empty value is not always equivalent to leaving it unset.

Runtime-provided variables such as `npm_execpath`, `CODEX_SANDBOX`, standard operating-system path variables and the optional managed-environment installer tuning variables remain referenced in the original source. They are not required for the documented portable startup and need not be supplied by the developer.

The template does not invent an application signing secret: the current authentication code generates session tokens and salts using Node crypto and stores their hashes in D1. Local test credentials are generated only when the developer explicitly runs `scripts/seed-local.mjs`.
