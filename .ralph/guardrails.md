# Ralph Guardrails (Signs)

> Lessons learned from past failures. READ THESE BEFORE ACTING.

## Core Signs

### Sign: Read Before Writing
- **Trigger**: Before modifying any file
- **Instruction**: Always read the existing file first
- **Added after**: Core principle

### Sign: Test After Changes
- **Trigger**: After any code change
- **Instruction**: Run tests to verify nothing broke
- **Added after**: Core principle

### Sign: Commit Checkpoints
- **Trigger**: Before risky changes
- **Instruction**: Commit current working state first
- **Added after**: Core principle

---

## Learned Signs

### Sign: Guard Against Invalid Speed Values
- **Trigger**: When computing averages from feed fields like `@_speedKmHr` / `speedKmHr`
- **Instruction**: Treat missing/non-numeric/negative values as invalid, exclude them from aggregates, and ensure outputs never become `NaN` (use `null` or omit fields when no valid samples exist).
- **Added after**: Iteration 3 - discovered missing/non-numeric speed values can yield `NaN` and break sorting/UI expectations

