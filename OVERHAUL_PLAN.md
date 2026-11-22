# DelWin Mobile Game — Development Roadmap

## Repository and release safety

- **Preview repository:** `honorbiz88-maker/DW-Mobile-Game-App-Preview`
- **Active development branch:** `main` in the Preview repository.
- **Preview site:** https://honorbiz88-maker.github.io/DW-Mobile-Game-App-Preview/
- **Production repository:** `honorbiz88-maker/DW-Mobile-Game-App` — do not modify during Preview development.
- All changes described here are Preview-only. Do not publish to the production repository without explicit owner approval.

## Product direction

DelWin Mobile is a roadside tire-rescue and mobile-service business simulator. Preserve the dispatch → five-step repair bay → invoice loop while deepening the career, fleet-management, territory, and commercial-contract systems.

The game is intended to be **monetized at a later production stage**. Monetization is deferred, not cancelled. The core game and progression economy must be balanced first, and players must be able to build a successful roadside business without paying.

### Monetization guardrails

- Keep simulated/fake ad rewards removed and disabled.
- Keep simulated purchase grants disabled.
- Keep the Token-to-Gear exchange and Token gates on rig progression removed.
- Do not add fake purchase or ad flows to Preview.
- Real rewarded ads and real in-app purchases are planned for a later production phase.
- Premium currency and paid bundles are to be designed only after the core economy is validated.
- Rewarded ads should be optional and provide convenience or modest bonuses, never block normal progression.
- Paid bundles should not deliberately create frustration or make free progression unviable.
- Initial store target: Google Play; Apple App Store follows later.
- Production monetization requires real store billing, server-side purchase/receipt validation, ad-network integration, privacy/consent handling, and store-policy review.

## Current foundation

- Separate Preview repository and GitHub Pages site are established.
- Production repository remains separate and untouched.
- Firebase project `delwin-mobile-game` is configured with Email/Password authentication and Firestore.
- `firebase-cloud.js` provides account and cloud-save groundwork; `firestore.rules` restricts each authenticated user to their own save document.
- Local saves remain supported. Existing `delwin_v4_save` data is preserved through the current loader/migration behavior.
- Preview purchase and rewarded-ad handlers explicitly report that real integrations are unavailable; they do not grant simulated rewards.
- The Preview contains tracked assets under `assets/`, including SVG graphics.
- `index.html`, `game.js`, `style.css`, `audio.js`, Firebase files, and setup documentation are present.

## Completed development work

- [x] Establish isolated Preview repository and deployment.
- [x] Configure Firebase Authentication and Firestore save foundation.
- [x] Preserve local career saves and add cloud-save conflict handling.
- [x] Remove Token-to-Gear exchange and rig-progression Token gates.
- [x] Disable simulated purchase grants and remove fake ad reward controls.
- [x] Add predictable, save-safe career Gold Gear milestones.
- [x] Align tool/rig progression, commercial vehicle eligibility, VIP dispatch, contract objectives, and displayed rewards.
- [x] Guard duplicate job completion and prevent territory changes during an active call.
- [x] Add rig wear and optional maintenance.
- [x] Snapshot dispatch overhead and contract reward economics at issuance.
- [x] Remove the artificial minimum service payout floor.
- [x] Improve dispatch earnings estimates to account for estimated consumed supplies.
- [x] Correct zero-condition handling so a rig at 0% can still be serviced.
- [x] Lock a Surge multiplier to the dispatch accepted, rather than allowing a mid-repair activation to boost an already accepted job.
- [x] Price partial plug-kit restocks proportionally to the number of kits actually added.
- [x] Confirm current Preview `game.js` passes a JavaScript syntax parse check.

## Active work: economy and progression validation

1. Audit every inventory decrement, refill, repair action, maintenance cost, and dispatch estimate.
2. Build exact Gear and cash progression models from the live source constants and formulas.
3. Simulate casual, regular, dedicated, and high-volume play patterns across all six hubs.
4. Validate time-to-unlock for each tool tier, rig tier, and territory against the intended career pacing.
5. Review edge cases in contracts, ratings, streaks, Surge, dispatch refresh, and save migration.
6. Make only evidence-backed balance changes; preserve approved progression decisions unless a measured issue justifies a change.

## Next gameplay and product phases

### Gameplay depth
- Add more tire and wheel failure types, repair-versus-replace decisions, and multi-stage commercial jobs.
- Expand weather, night work, traffic, shoulder safety, and equipment interactions.
- Add repeat business customers, fleet service contracts, certifications, and equipment specialization.
- Build meaningful late-game dispatches, elite contracts, achievements, and endgame goals.

### Stability and quality
- Add automated regression tests for core economy formulas, reward grants, state migrations, and critical state transitions.
- Test responsive layouts, touch interactions, timers, audio activation, and save recovery in real mobile browsers.
- Audit dynamic HTML insertion and validate player-editable profile data.
- Verify every referenced asset and fallback.
- Test account creation, sign-in, cloud save, offline behavior, and conflict resolution in a real browser.

### Production monetization and launch
- Finalize a fair premium-currency and bundle economy only after progression is balanced.
- Integrate real Google Play billing and purchase validation.
- Integrate optional rewarded advertising with consent and privacy requirements.
- Complete store-policy, privacy, data-safety, and release-readiness reviews.
- Plan Apple App Store support after the Google Play launch path is stable.

## Testing and release discipline

- A passing JavaScript syntax check is not a substitute for an interactive browser playtest.
- A successful GitHub Pages workflow confirms deployment, not full gameplay correctness.
- Record exactly which commit was deployed and whether the latest workflow succeeded.
- Do not claim mobile gameplay, Firebase end-to-end behavior, or purchase/ad integration is tested until it has actually been exercised.
- Keep all active development in this Preview repository; never change the production repository without explicit approval.
