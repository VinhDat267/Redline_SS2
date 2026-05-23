# Redline Documentation

This directory contains the operational, testing, demo, and design references
for Redline as a production-oriented contract review platform.

## Directory Structure

| Path | Purpose |
| --- | --- |
| `demo/full-system-demo/` | End-to-end demo kit with realistic MSA/SOW contracts, PDF fixtures, operator runbook, and presenter notes |
| `design/` | Current product and visual design reference |
| `testing/` | Regression, smoke, eval, and truth-boundary testing pack |
| `testing/eval-pack/` | English AI Review and Contract Q&A evaluation harness |
| `testing/demo-showcase/` | Vietnamese showcase fixtures and historical rehearsal evidence |

## Canonical Entry Points

| Document | Use |
| --- | --- |
| `../README.md` | Product overview, Docker quickstart, environment variables, verification, deploy notes |
| `testing/README.md` | Testing pack overview and current automated baselines |
| `testing/reference-system-map.md` | Runtime map, routes, API map, env variables, test maps |
| `testing/tutorial-redline-e2e-full-pass.md` | Manual end-to-end product workflow |
| `demo/full-system-demo/README.md` | Realistic demo package and recommended live workflow |
| `demo/full-system-demo/operator-runbook.md` | Operator checklist for service startup, health checks, and demo fallback handling |

## Documentation Policy

- Keep production/current runbooks in `README.md`, `docs/testing/`, and `docs/demo/full-system-demo/`.
- Keep generated files under `output/`; do not commit generated DOCX/PDF screenshots or Playwright artifacts.
- Treat `testing/demo-showcase/vn-rehearsal-evidence.md` as historical evidence unless it is refreshed by a new rehearsal.
- Parser and compare truth are deterministic. AI docs must describe AI Review, Contract Q&A, and AI traceability as suggestion/support layers, not final workflow truth.
