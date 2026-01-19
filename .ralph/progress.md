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
