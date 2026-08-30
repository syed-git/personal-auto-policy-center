# PolicyCenter — Personal Auto

A Guidewire PolicyCenter–style replica for personal auto insurance: full submission wizard, policy change, flat & pro-rata cancellation, reinstatement, and renewal — with a React frontend and a persistent backend.

## Run locally (single command)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Frontend (Vite) and API run in a single process; data persists in `data/db.json` across restarts.

## Users

| Role | Username | Password |
|---|---|---|
| Account Executive | `aexec` | `gw123` |
| Underwriter | `uwriter` | `gw123` |

Underwriters can issue policies backdated more than 90 days without approval; account executives need underwriter approval (surfaced as a blocking underwriting issue on the Risk Analysis screen).

## Deploy to Netlify

Just connect the repo — `netlify.toml` builds the frontend and serves the API as a Netlify Function backed by **Netlify Blobs**, so data persists across deploys/restarts. No environment variables required.

## Features

- Dashboard with all policies, status badges, search, and status filters
- Submission wizard: Policy Info → Drivers → Vehicles → Coverages → Quote → Risk Analysis → Review → Policy Summary
- Field validation (names letters/spaces only, 10-digit license, 15-char VIN starting with `VIN`, mandatory fields with red inline errors)
- Underwriting issues: >90-day backdating, drivers under 16, high-risk drivers — blocking until underwriter approval
- Rating engine with per-vehicle/driver/coverage premium breakdown
- Policy change (re-runs the full wizard with editable effective date), renewal, flat/pro-rata cancellation with reason & refund calculation, reinstatement
- Full transaction history per policy
