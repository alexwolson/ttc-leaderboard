# Progress Log

> Updated by the agent after significant work.

---

## Session History


### 2026-01-19 18:22:13
**Model selection** - pinned `auto`

### 2026-01-19 18:22:13
**Session 1 started** (provider: cursor, model: auto)

### 2026-01-19 18:26:00
- **Completed**: Phase 0 checkbox — documented current “speed” definition (`@_speedKmHr` / `speedKmHr`), units (km/h), and pitfalls (missing/non-numeric values can yield `NaN`).
- **Changes**: Added inline documentation in `api/ttc.ts` and expanded “How It Works” in `README.md`.
- **Next**: Phase 0 — add a guardrail if a repeated failure mode shows up; then move to Phase 1 backend changes.

### 2026-01-19 18:23:20
**Session 1 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:23:22
**Model selection** - pinned `auto`

### 2026-01-19 18:23:22
**Session 2 started** (provider: cursor, model: auto)

### 2026-01-19 18:26:11
**Session 2 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:26:13
**Model selection** - pinned `auto`

### 2026-01-19 18:26:13
**Session 3 started** (provider: cursor, model: auto)

### 2026-01-19 18:33:00
- **Completed**: Phase 0 checkbox — added a learned guardrail for invalid/missing speed values yielding `NaN`.
- **Changes**: Updated `.ralph/guardrails.md`; marked Phase 0 guardrail checkbox complete in `RALPH_TASK.md`.
- **Verification**: Ran `npm run lint && npm run build` (pass).

### 2026-01-19 18:27:14
**Session 3 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:27:16
**Model selection** - pinned `auto`

### 2026-01-19 18:27:16
**Session 4 started** (provider: cursor, model: auto)

### 2026-01-19 18:28:41
- **Completed**: Phase 1 checkbox — removed the streetcar-only (`5xx`) route filter in `api/ttc.ts` so live speed averages include all routes present in the feed.
- **Changes**: Updated `api/ttc.ts`; marked the Phase 1 checkbox complete in `RALPH_TASK.md`.
- **Verification**: Ran `npm run lint && npm run build` (pass).

### 2026-01-19 18:28:59
**Session 4 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:29:01
**Model selection** - pinned `auto`

### 2026-01-19 18:29:01
**Session 5 started** (provider: cursor, model: auto)

### 2026-01-19 18:31:10
- **Completed**: Phase 1 checkbox — hardened `api/ttc.ts` against TTC feed shape differences (`body.vehicle` single object vs array vs missing), avoiding runtime throws.
- **Changes**: Normalized parsed vehicles with an `asArray(...)` helper and skipped vehicles missing a valid `routeTag`.
- **Verification**: Ran `npm run lint && npm run build` (pass).

### 2026-01-19 18:31:04
**Session 5 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:31:06
**Model selection** - pinned `auto`

### 2026-01-19 18:31:06
**Session 6 started** (provider: cursor, model: auto)

### 2026-01-19 18:36:00
- **Completed**: Phase 1 checkbox — implemented validation rules for invalid speed values (missing/empty/non-numeric/negative excluded; 0 included) to prevent `NaN`/`Infinity`.
- **Changes**: Added `parseSpeedKmh(...)` in `api/ttc.ts`, excluded invalid samples from aggregates, and documented rules in `README.md`; marked the Phase 1 checkbox complete in `RALPH_TASK.md`.
- **Next**: Phase 1 — add route titles to API response (no hardcoded map), then define a stable response shape.

### 2026-01-19 18:32:44
**Session 6 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:32:46
**Model selection** - pinned `auto`

### 2026-01-19 18:32:46
**Session 7 started** (provider: cursor, model: auto)

### 2026-01-19 18:45:00
- **Completed**: Phase 1 checkbox — added TTC route titles to the API response (no hardcoded map) by fetching NextBus/UmoIQ `routeList` metadata.
- **Changes**: Implemented `getRouteTitlesByTag(...)` with an in-memory TTL cache; appended `routeTitle` as the 3rd element in each returned tuple to keep index 0/1 backward compatible; marked the Phase 1 checkbox complete in `RALPH_TASK.md`.
- **Verification**: Ran `npm run lint && npm run build` (pass).
- **Next**: Phase 1 — define and implement a stable API response shape (objects) including `routeTitle` and metadata.

### 2026-01-19 18:35:30
**Session 7 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:35:32
**Model selection** - pinned `auto`

### 2026-01-19 18:35:32
**Session 8 started** (provider: cursor, model: auto)

### 2026-01-19 18:55:00
- **Completed**: Phase 1 checkbox — replaced the `/api/ttc` tuple response with a stable object response including `routeTag`, `routeTitle`, `liveSpeedKmh`, `vehicleCount`, and `updatedAt` (ISO string).
- **Changes**: Updated `api/ttc.ts` to return `LiveRouteSpeed[]`; updated `src/App.tsx` to consume the new response shape (minimal mapping to existing UI model).
- **Next**: Phase 1 — deterministic API sorting to avoid UI jitter (tie-break by `routeTag`).

### 2026-01-19 18:37:09
**Session 8 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:37:11
**Model selection** - pinned `auto`

### 2026-01-19 18:37:11
**Session 9 started** (provider: cursor, model: auto)

### 2026-01-19 18:38:14
- **Completed**: Phase 1 checkbox — ensured `/api/ttc` sorting is deterministic (speed desc, tie-break by `routeTag`) to reduce UI jitter.
- **Changes**: Updated `api/ttc.ts` sort comparator to be stable and deterministic for equal speeds; marked the checkbox complete in `RALPH_TASK.md`.
- **Next**: Phase 2 — choose and implement a persistence strategy for 24h history (recommended: Vercel KV).

### 2026-01-19 18:38:42
**Session 9 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:38:44
**Model selection** - pinned `auto`

### 2026-01-19 18:38:44
**Session 10 started** (provider: cursor, model: auto)

### 2026-01-19 18:40:16
- **Completed**: Phase 2 checkbox — chose **Vercel KV** (via `@vercel/kv`) as the persistence strategy for 24-hour history.
- **Changes**: Marked the Phase 2 persistence-strategy checkbox complete in `RALPH_TASK.md`; noted the KV-based persistence approach in `README.md`.
- **Next**: Phase 2 — add the KV dependency + env var wiring, then implement sampling/aggregation.

### 2026-01-19 18:40:16
**Session 10 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:40:34
**Session 10 ended** - Agent finished naturally (15 criteria remaining)

### 2026-01-19 18:40:36
**Model selection** - pinned `auto`

### 2026-01-19 18:40:36
**Session 11 started** (provider: cursor, model: auto)

### 2026-01-19 18:42:33
**Session 11 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:42:35
**Model selection** - pinned `auto`

### 2026-01-19 18:42:35
**Session 12 started** (provider: cursor, model: auto)

### 2026-01-19 18:43:57
**Session 12 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:43:59
**Model selection** - pinned `auto`

### 2026-01-19 18:43:59
**Session 13 started** (provider: cursor, model: auto)

### 2026-01-19 18:44:30
**Session 13 ended** - ↻ ROTATE (restart cursor, model: auto)

### 2026-01-19 18:44:32
**Model selection** - pinned `auto`

### 2026-01-19 18:44:32
**Session 14 started** (provider: cursor, model: auto)

### 2026-01-19 18:47:48
- **Completed**: Phase 2 checkbox — added `@vercel/kv` dependency + environment-variable wiring.
- **Changes**: Added `api/kv.ts` helper for KV env detection/client creation; added `.env.example`; updated `.gitignore` to avoid committing `.env`; documented KV env vars in `README.md`; marked the Phase 2 checkbox complete in `RALPH_TASK.md`.
- **Verification**: Ran `npm run lint && npm run build` (pass).
- **Next**: Phase 2 — implement sampling/aggregation strategy for rolling 24h averages.
