# Contributing

## Development setup

- Node.js 20+ and a system Chrome or Edge are required. Docker is only needed for `promote`/`rollback` paths.
- `npm ci`, `npm run build`, then `npm test`. `npm run typecheck` is the fast check while iterating.
- `npm run example:build && npm run example:serve` starts the demo target on `http://127.0.0.1:4173`. To exercise the failure path, run `FPG_BREAK_CSS=1 node examples/vite-react/server.mjs` and verify against `fpg.broken-test.yml`.

## Change rules

- Visual baselines only change through `fpg baseline update` followed by human review. A failing run must never write baselines.
- Every new check lands in the report with a name, status, and detail. Keep `report.html` self-contained: no external links or CDN assets.
- Keep the section structure of `README.md` and `README.zh-CN.md` aligned. User-facing text ships in both languages.
- Issues labeled `roadmap` describe planned directions. Comment there before starting large features.
