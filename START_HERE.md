# ApexAI Clean Handoff

This folder is a cleaned project handoff package.

What is included:

- app source
- server source
- iOS Capacitor project
- tests and E2E coverage
- docs and handoff notes

What was intentionally removed:

- `node_modules`
- build output (`dist`)
- generated iOS web bundle (`ios/App/App/public`)
- temporary test artifacts
- logs
- old recovery scaffolding

Open these first:

- `AI_HANDOFF.md`
- `RESTORE_STATUS.md`
- `docs/PRODUCTION_IPHONE_SETUP.md`

Typical commands:

```powershell
npm install
npm run test:full
npm run dev
```
