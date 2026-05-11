# Testing Audit Removal Guide

This Coach audit system is temporary and intended only for beta testing.

## 1. Disable it immediately
Turn off these environment variables:

- Frontend: `VITE_ENABLE_COACH_AUDIT=false`
- Backend: `ENABLE_COACH_AUDIT=false`

Optional admin allowlist vars used only while testing:

- `VITE_COACH_AUDIT_ADMIN_EMAILS`
- `VITE_COACH_AUDIT_ADMIN_IDS`
- `COACH_AUDIT_ADMIN_EMAILS`
- `COACH_AUDIT_ADMIN_IDS`

## 2. Files added or updated for the temporary audit layer

### Backend
- `server/coachAudit.mjs`
- `server/openaiCoachServer.mjs`

### Frontend
- `src/lib/coachAuditClient.js`
- `src/pages/CoachAudit.jsx`
- `src/pages/Coach.jsx`
- `src/App.jsx`

### Tests / scripts / docs
- `scripts/coach-chaos-test.mjs`
- `tests/coachAudit.test.mjs`
- `TESTER_QA_SCRIPT.md`
- `TESTING_AUDIT_REMOVAL.md`

## 3. Route to remove
- `/admin/coach-audit`

## 4. Temporary storage cleanup
Coach audit logs are currently stored in `user_app_state` with storage keys prefixed by:

- `coach_audit:`

Before production, archive or delete those rows.

Suggested cleanup approach:
1. Export rows where `storage_key LIKE 'coach_audit:%'`
2. Archive anything you still need for debugging
3. Delete those rows from `user_app_state`

## 5. UI cleanup
Remove the beta notice from Coach:
- `Beta testing notice: Coach conversations may be reviewed...`

## 6. Tests and scripts
Keep only if useful:
- `scripts/coach-chaos-test.mjs`
- `tests/coachAudit.test.mjs`

If you no longer want ongoing audit-specific QA, delete them.

## 7. Privacy cleanup before production
- Delete archived audit rows that are no longer needed.
- Confirm no tester-conversation export files remain in shared folders.
- Confirm the admin route is gone or fully gated off.
- Confirm the frontend no longer exposes any audit-specific copy or admin tooling.

## 8. Final pre-production check
After removal:
1. Run `npm run lint`
2. Run `npm test`
3. Run `npm run typecheck`
4. Run `npm run build`
5. Run `npx playwright test`

The app should behave exactly the same for normal users, minus the beta-only audit tooling.
