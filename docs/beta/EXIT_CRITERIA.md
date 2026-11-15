# External beta — Exit criteria

These criteria decide whether Step **5D-B** (invite / collect results) may proceed.
**Preparation READY ≠ criteria met.** Do not claim pass until real tester submissions exist.

## Required for beta pass

| # | Criterion | Status until evidence |
| --- | --- | --- |
| 1 | At least **2** independent testers submit checklists | Unverified |
| 2 | Fresh install succeeds on clean systems (clone → init → beta defaults → Compose build/up) | Unverified externally |
| 3 | Administrator setup and login work (no permanent blank Overview) | Unverified externally |
| 4 | Core dashboard routes work (Overview, Keys, Playground, Cache, Settings, Docs) | Unverified externally |
| 5 | Scoped API key create / reject unauthorized / revoke behavior works | Unverified externally |
| 6 | No unexpected paid Apify runs (`APIFY_DAILY_RUN_LIMIT=0`, empty token) | Unverified externally |
| 7 | No owner data or credentials exposed to testers | Process requirement |
| 8 | No unresolved **BLOCKER** issues | Unverified |
| 9 | No unresolved security-critical issues | Unverified |
| 10 | No unresolved **HIGH** severity core bugs | Unverified |
| 11 | Documentation matches actual installation commands | Owner review |
| 12 | CI remains green on the tested commit | Check GitHub Actions |

## Explicit non-goals for first beta

- Live Apify Actor execution
- Shared staging login using owner credentials
- Published GHCR images
- Public internet exposure of owner localhost

## Owner gate

Only the owner may invite testers or start Step 5D-B after reviewing preparation deliverables.
