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

### Source-verified upgrade cost baseline (Preview main)

The current `game.js` formula includes the established 20% discount on upgrades from Levels 1–4 and the 15% easing on upgrades from Level 13 onward. The late-game 1.14 tier factor remains in place. The following are exact costs calculated from those source formulas, not estimates of service earnings.

| Hub | Tool upgrade cash | Rig commission cash | Total cash | Gold Gears |
|---|---:|---:|---:|---:|
| 1 · Atlanta Metro | $5,670 | $0 | $5,670 | 4 |
| 2 · Georgia Freight | $21,610 | $1,800 | $23,410 | 9 |
| 3 · Coastal Ports | $66,000 | $9,500 | $75,500 | 14 |
| 4 · Southeast Express | $195,350 | $36,000 | $231,350 | 19 |
| 5 · Gulf Corridor | $595,800 | $108,000 | $703,800 | 24 |
| 6 · Apex Syndicate | $1,133,000 | $360,000 | $1,493,000 | 5 |
| **Full progression** | **$2,017,430** | **$515,300** | **$2,532,730** | **75** |

Gold Gear demand is 60 for the five tool breakthroughs across four tools, plus 15 for the five rig commissions. Hub 6 has no additional tool breakthrough Gear cost because the final tool breakthrough is Level 20 → 21 in Hub 5.

The 20% early and 15% late discounts were present in the earlier Preview implementation. They were accidentally dropped when the duplicate initialization block was removed, because the copy containing those adjustments was deleted while the remaining function lacked them. The discounts have now been restored in the single active `getToolUpgradeSpec()` implementation.

### Source-verified reward streams

- Career call milestones award 15 Gold Gears total by 275 completed calls (1, 2, 2, 3, 3, and 4 at the configured milestones).
- Clean streak awards occur at 3, 6, 9, 12, and 15 consecutive clean calls: 1, 1, 2, 1, and 3 Gears. The streak resets after the 15-call reward.
- Contracts award 1 Gear on every fifth completed contract; the Fast and Heavy contract types each also award 1 Gear directly.
- Contract rewards and dispatch overhead are snapshotted when offered. Heavy contracts are gated until Hub 2 and the Tier 2 rig are available.

A renewal-reward calculation using the current streak rules estimates the following streak-only Gear yield per completed call. It assumes a constant independent clean-call probability and is a sensitivity model, not observed player telemetry:

| Clean-call rate | Expected streak Gears / call | Expected streak Gears over 275 calls |
|---:|---:|---:|
| 65% | 0.141 | 38.7 |
| 75% | 0.208 | 57.3 |
| 85% | 0.306 | 84.0 |
| 92% | 0.399 | 109.6 |

Career milestones add up to 15 more by call 275. Contract Gears are additional and depend on how quickly players complete and claim objectives. This makes clean performance and contract participation the main variables in Gear availability; do not tune Gear prices from the maximum-perfect-streak case alone.

### Current conclusions

- The verified full tool-plus-rig cash requirement is **$2,532,730** with the established discounts restored.
- Clean-streak and career Gear rewards can supply the 75-Gear progression requirement for engaged players; contract rewards add further Gears. Low-clean-rate players need more contract participation. These are expected-value estimates, not observed player telemetry.
- Rig maintenance now has a capped operating-overhead effect (0–20%) and service costs $1.50 per condition point restored. It is a modest operating incentive, not a hard failure gate.
- Dispatch estimates subtract the estimated replacement cost of the consumed supply. The estimate excludes performance bonuses and penalties by design.
- A provisional cash-flow simulation indicates that full max-level progression is a multi-thousand-call career. The estimate assumes 70% fast completions, 5-star rating, two free Surges used per day, one contract claimed about every 10 calls, strategic territory selection, and estimated contract/VIP value. It is sensitive to actual play frequency, contract cadence, Surge use, penalties, and inventory behavior; use it as a pacing warning, not a release promise.

### Remaining validation

1. Run repeatable Monte Carlo simulations with actual dispatch and repair distributions, contract objective completion, Surge recharge, and inventory timing.
2. Validate time-to-unlock for each tool tier, rig tier, and territory against intended career pacing.
3. Test low/average/high performance and missed-contract scenarios; identify whether late-game cash costs create an excessive grind.
4. Review edge cases in ratings, Surge, dispatch refresh, and save migration.
5. Make only evidence-backed balance changes; preserve approved progression decisions unless measured results justify a change.

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
