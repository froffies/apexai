# Tester QA Script

This checklist is for the temporary beta-testing phase while Coach audit logging is enabled.

## Tester notice
Coach conversations may be reviewed to improve logging accuracy and app reliability. Do not enter private medical, financial, or highly sensitive information.

## Core walkthrough
1. Sign up or sign in.
   Expected: You land in the app without auth errors or blank screens.
2. Complete onboarding.
   Expected: Inputs save cleanly, review step wraps properly on desktop and mobile, and the dashboard loads after save.
3. Open Coach and send a normal greeting.
   Expected: The reply feels natural, not like a command menu, and nothing is logged.
4. Log a fragmented meal over multiple turns.
   Example: `I had eggs and tea` -> `3 eggs` -> `250ml black tea`.
   Expected: Coach asks only useful follow-ups, does not repeat the same question, and logs one correct meal.
5. Correct a saved meal.
   Example: `actually it was 4 eggs not 3`.
   Expected: The existing meal updates instead of creating a duplicate.
6. Try a nutrition question without logging intent.
   Example: `How much protein is usually in a small latte?`
   Expected: Coach answers the question and does not create a meal log.
7. Try `don't log that`.
   Expected: Coach confirms it will not save the item and Nutrition stays unchanged.
8. Log a workout in one turn.
   Example: `bench press 60kg x 8 x 3`.
   Expected: One workout is saved and it appears in Workouts.
9. Correct the workout.
   Example: `actually that was 65kg`.
   Expected: The saved workout updates instead of duplicating.
10. Refresh after meal and workout saves.
    Expected: Nutrition, daily totals, workouts, and completed sets still match what was saved.
11. Try a rapid double-send on the same Coach message.
    Expected: No duplicate log is created.
12. Try a failed or awkward interaction.
    Examples:
    - `I told you`
    - `what do you mean?`
    - typo-heavy food message
    Expected: Coach does not crash, does not invent weird items, and keeps the draft if the live request fails.
13. Edit and delete a meal in Nutrition.
    Expected: Edit works cleanly, delete removes the item, and undo works if shown.
14. Edit and delete a workout in Workouts.
    Expected: History and volume update correctly.
15. Update Profile targets.
    Expected: The profile saves and survives refresh/logout/login.
16. Test mobile layout.
    Expected: No horizontal scrolling, no clipped cards, and the Coach notice/banner does not break layout.

## High-value things to watch for
- Coach says something was saved, but the app does not show it.
- Coach asks the same clarification twice.
- Meals with weird fragments like `the rest`, `with gravy`, or `actually` end up corrupted.
- Numeric junk appears as food, such as `18` or `1 serve 18`.
- A nutrition question gets turned into a meal log.
- A correction creates a second record instead of updating the first.
- A failed request clears the draft.
- Double tapping Send creates duplicate logs.

## How to report issues
1. Capture the exact conversation transcript.
2. Note the screen where the data actually appeared or failed to appear.
3. If you have admin access, open `/admin/coach-audit`, find the conversation, and use:
   - `Copy log JSON`
   - `Copy debug prompt`
4. Report:
   - what you typed
   - what Coach replied
   - what should have happened
   - what actually got saved
   - whether refresh changed anything

## Known limitations for beta
- Ambiguous `the rest` across multiple active foods may still need one clarification.
- Vague day recaps may still need explicit meal boundaries.
- Underspecified meals may be logged as estimates.
- This build is live tester ready, not production ops complete.
