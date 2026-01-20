---
task: Expand the TTC leaderboard to include all routes (not just streetcars) and add rolling 24-hour average speeds.
completion_criteria:
  - API returns speeds for all TTC routes with available vehicle speed data (not restricted to 5xx streetcars).
  - Route names are not hardcoded; UI shows route titles for all returned routes.
  - Data model includes both live speed and a 24-hour rolling average per route (with timestamps/metadata).
  - A persistence strategy exists for 24-hour averages (recommended: Vercel KV); app degrades gracefully if not configured.
  - UI clearly displays whether values are live or 24-hour averages and handles missing data without crashing.
  - README documents how the speeds are computed and how to configure any required environment variables.
  - Lint and build succeed.
max_iterations: 20
test_command: "npm run lint && npm run build"
---

# Task: TTC Leaderboard — All Routes + 24h Averages

## Context (current repo behavior)

- The backend endpoint `api/ttc.ts` fetches TTC NextBus `vehicleLocations` and **only includes routes where `routeTag` starts with `"5"`** (streetcars). It computes a per-route average from `@_speedKmHr` across active vehicles.
- The frontend `src/App.tsx` renders a leaderboard from `/api/ttc` and uses a **hardcoded** `route_map` to convert route numbers to names (streetcar-only).

## Goal

Modify this repository to:

1. Show speeds for **every available route**, not just streetcars.
2. Show **24-hour averages** (rolling 24-hour average speeds per route).

Where “available route” and “24-hour average” must be implemented consistently end-to-end (API + UI + docs).

## Working assumptions (use unless overridden by user)

- **Available routes**: any `routeTag` present in the TTC `vehicleLocations` feed at fetch time **with a valid `@_speedKmHr`** value.
- **24-hour average**: a rolling, time-weighted average computed from periodic samples of per-route averages over the last 24 hours.
- **Persistence**: implement system-wide 24h averages using **Vercel KV** (preferred). If KV is not configured locally, the app still shows live speeds and indicates that 24h averages are unavailable.

If user answers clarifiers later, update this file (and/or `.ralph/guardrails.md`) and continue.

## Success Criteria

The task is complete when ALL of the following are true:

### Phase 0 — Baseline / guardrails

- [x] Identify and document the current definition of “speed” (what `@_speedKmHr` represents, units, and any pitfalls like missing/zero values).
- [x] Add a short note to `.ralph/guardrails.md` if you encounter a repeated failure mode (e.g., broken API contract, route title mismatches, KV env confusion).

### Phase 1 — Backend: include all routes + route titles

- [x] Update `api/ttc.ts` to **not** filter only `5xx` routes; compute live averages for all routes with speed data.
- [x] Handle feed shape differences safely (e.g., `vehicle` can be a single object or an array) without throwing.
- [x] Decide and implement rules for invalid speed values (missing, non-numeric, negative). Document the rule in code comments and README.
- [x] Provide **route titles** for returned routes (no hardcoded streetcar-only map). Preferred approach:
  - fetch TTC route metadata (e.g., NextBus `routeList` and/or `routeConfig`) and map `routeTag -> title`.
- [x] Define and implement a stable API response shape (JSON objects, not raw tuples) that includes at minimum:
  - `routeTag`
  - `routeTitle`
  - `liveSpeedKmh`
  - `vehicleCount`
  - `updatedAt` (ISO string)
- [x] Ensure the API sorts results deterministically (primary by selected metric, secondary by `routeTag`) to avoid UI jitter.

### Phase 2 — 24-hour rolling averages (persistence + computation)

- [x] Choose a persistence strategy for 24h history. Preferred: Vercel KV via `@vercel/kv`.
- [x] Add any required dependencies and wire up environment variable configuration (document in README).
- [x] Implement a sampling/aggregation strategy that produces a rolling 24-hour average per route. Minimum requirements:
  - stores samples with timestamps
  - trims data older than 24 hours
  - computes `avg24hSpeedKmh` robustly even with missing samples
- [x] Implement clear behavior when persistence is unavailable (e.g., missing KV env):
  - API still returns live speeds
  - `avg24hSpeedKmh` is `null` (or omitted) and UI indicates “24h unavailable”
- [x] Add basic safeguards for serverless constraints (payload size, KV key cardinality, trimming strategy).

### Phase 3 — Frontend: display all routes + 24h averages

- [x] Remove/replace the hardcoded `route_map` usage; UI uses `routeTitle` from the API response.
- [x] Update frontend types (e.g., `LeaderboardData`) to support both `liveSpeedKmh` and `avg24hSpeedKmh` (and any needed metadata).
- [x] Update the leaderboard row UI (`LeaderboardPosition`) to display:
  - route tag/number
  - route title
  - live speed (km/h)
  - 24h average (km/h) OR a clear placeholder if unavailable
- [x] Decide leaderboard ranking behavior and implement it:
  - default sort metric (live vs 24h)
  - optional toggle to switch sort metric (recommended)
- [x] Update any explanatory copy (title/info text) so it’s no longer “streetcars only” and accurately describes live vs 24h metrics.
- [ ] Ensure UI is resilient:
  - does not crash when `avg24hSpeedKmh` is null
  - handles unknown/empty route titles gracefully
  - continues working if API returns an empty list

### Phase 4 — Performance, correctness, and polish

- [ ] Avoid unnecessary client jitter (reduce needless reorders / excessive animation churn) when many routes update frequently.
- [ ] Ensure the update queue logic still behaves correctly with a larger set of routes (no runaway growth, no starvation).
- [ ] Add minimal inline documentation in the API and UI about assumptions and calculation methods.

### Phase 5 — Documentation & verification

- [ ] Update `README.md` to include:
  - new scope (all TTC routes with speed data)
  - how live speed is computed
  - how 24h average is computed
  - any required env vars for persistence (and local dev instructions)
- [ ] Run the test command successfully: `npm run lint && npm run build`.

## Constraints / notes

- Do not introduce secrets into the repo. Any KV/DB credentials must be configured via environment variables and documented.
- Keep the API backward compatible only if easy; otherwise update frontend + backend together and document the new response format.
- Prefer deterministic, documented calculation rules over “best guess” behavior.

---

## Ralph Instructions

- Read `RALPH_TASK.md` plus state files in `.ralph/` at the start of every iteration:
  - `.ralph/guardrails.md` (things to avoid / rules learned)
  - `.ralph/progress.md` (what was done last, what’s next)
- Work on the **next unchecked checkbox** in “Success Criteria”.
- Make changes in small, reviewable increments.
- After completing a checkbox:
  - update `.ralph/progress.md` with a brief note (what changed, what’s next, any commands run)
  - commit with a descriptive message focused on the intent (“why”), not just files changed
- If you hit a failure mode that could repeat, add a guardrail to `.ralph/guardrails.md`.
- Never commit secrets (tokens, `.env`, credentials).
