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

### Source-verified reward streams — revised 2026-11-22

The previous reward structure was too generous. The source code was granting Gold Gears from three overlapping streams: frequent clean-streak drops, career call milestones, and both direct contract rewards and contract-completion milestones. The Preview implementation now uses a deliberately scarcer schedule:

- Career call milestones remain one-time awards totaling **15 Gold Gears** by 275 completed calls (1, 2, 2, 3, 3, and 4 at the configured milestones).
- Clean streaks now award **1 Gear only at 20 consecutive clean calls**. There are no Gear drops at 3, 6, 9, 12, or 15 calls. The streak resets after the 20-call reward.
- Contract types no longer grant direct Gold Gears. The Fast and Heavy contract rewardPart values are now zero.
- The contract-career milestone now grants **1 Gear every 6 completed contracts**, instead of every 5.
- Existing player Gear balances are preserved. Previously earned Gears are not removed or reset; already-issued contracts in existing saves retain their promised reward, while newly issued contracts use the revised rewards.
- Tool and rig Gear requirements remain unchanged at **75 total**. No new exchange, Gear purchase, or fake monetization flow has been added.

The new typical-play supply estimate is roughly 15 career Gears + about 55–60 contract milestone Gears across a 2,600-call career (assuming roughly one completed contract every 7–8 calls) + a small number of 20-clean-call streak rewards. That puts ordinary progression near the 75-Gear requirement rather than the previous large surplus. This is a pacing target, not a guarantee: contract completion and clean streak rates vary by player.

### Early Gear-access validation — 2026-11-22

The first Hub 2 unlock has a clear minimum Gear bill:

- Four tool breakthroughs from Level 4 to Level 5 cost 1 Gear each.
- The Tier 2 rig commission costs 1 additional Gear.
- **Total first Hub 2 Gear requirement: 5.** The player must also meet the separate tool cash, rig cash, and 1,800 REP gates.

The revised career awards alone provide 1 Gear at call 10 and 2 more at call 30 (3 cumulative), then 2 more at call 60 (5 cumulative). At the current planning assumption of roughly one completed contract every 7–8 calls, the sixth contract is expected around calls 42–48 and awards another Gear. That puts the player at roughly 4 Gears around the sixth contract and 6 by call 60, before any 20-clean-call streak reward. This is enough to cover the five-Gear Hub 2 package by the 60-call milestone if contracts are claimed; cash and REP may still be the actual gates.

This is a pacing calculation, not a deterministic guarantee. Players who delay claiming a completed contract block the next contract from being issued. Players with a slower contract completion rate may reach the five-Gear threshold later. The current evidence does **not** justify increasing early Gear rewards or changing the 20-call streak threshold. Validate the unlock timing in real playtests before making further adjustments.

The streak reward has a strongly skill-dependent expected frequency. Under an idealized independent-call model, the expected wait for 20 consecutive clean calls is about 1,257 calls at a 75% clean rate and about 72 calls at a 90% clean rate. These are mathematical expectations, not measured player behavior; real clean-call outcomes may be correlated and vary with difficulty. This means the streak stream is rare for typical execution but can add a meaningful earned bonus for consistently excellent play.

### Current conclusions

- The verified full tool-plus-rig cash requirement is **$2,532,730** with the established discounts restored.
- The revised Gear schedule is designed to put a typical player near the 75-Gear requirement over a full career, with the contract cadence as the main variable. Re-run the full progression simulation against the new reward schedule before treating the earlier max-progression call counts as current.
- Rig maintenance now has a capped operating-overhead effect (0–20%) and service costs $1.50 per condition point restored. It is a modest operating incentive, not a hard failure gate.
- Dispatch estimates subtract the estimated replacement cost of the consumed supply. The estimate excludes performance bonuses and penalties by design.
- A source-driven Monte Carlo audit was run against the earlier, more generous reward schedule. Its old Gear-balance outputs are historical and must not be used to describe the revised schedule. The current reduced Gear schedule has source-level and early-unlock checks documented here; a full updated Monte Carlo run including finite inventory and cash-starvation remains outstanding.
- The model assumes the player always chooses the highest unlocked territory, buys upgrades in a balanced order, accepts VIP calls when offered and affordable, and claims completed contracts after the modeled delay. It uses aggregate clean/fast probabilities and average penalty amounts rather than simulating every individual bay mistake.
- Supply costs are modeled at long-run replacement cost per call. The model does **not** yet simulate finite stock inventory, cargo-capacity restocking, or a cash-starved player being unable to buy the next supply. Results are directional pacing estimates, not observed telemetry or a release promise.

### Economy stress test — 2026-11-22

Each scenario uses 30 seeded runs. These call counts were generated before the Gold Gear reward reduction below and are now **historical / superseded**; do not use them as current time-to-max estimates. Re-run progression with the revised contract and clean-streak rewards before using new call counts.

| Scenario | Main assumptions | Calls to max progression |
|---|---|---:|
| Strong execution | 90% clean, 85% fast, $10 average penalty on non-clean calls, 2 free Surges/day, prompt rig service, immediate contract claims | **2,471** (2,433–2,519) |
| Typical execution | 75% clean, 65% fast, $30 average penalty on non-clean calls, 2 free Surges/day, prompt service, immediate claims | **2,604** (2,564–2,632) |
| Rough execution | 55% clean, 40% fast, $50 average penalty on non-clean calls, 1 free Surge/day, prompt service, 2-call contract-claim delay | **3,320** (3,264–3,376) |
| Rough, no Surges | Same rough-play assumptions, but no free Surge use | **3,676** (3,625–3,740) |
| Poor execution | 35% clean, 30% fast, $60 average penalty on non-clean calls, no Surges, prompt service, 5-call claim delay | **4,440** (4,365–4,484) |
| Standard-tier stress | 25% clean, 20% fast, $100 average penalty on non-clean calls, no Surges, prompt service, 5-call claim delay | **5,646** (5,481–5,786) |

Additional comparisons:
- Typical play with a 5-call delay before claiming each completed contract takes **2,838 calls** (2,817–2,887), about 9% longer than immediate claims. A contract that is completed but never claimed blocks the next contract from being issued; the current game intentionally requires a manual claim.
- Typical play with no rig servicing takes **2,634 calls** (2,588–2,652), versus 2,604 with prompt service. Neglecting service saves service fees but increases operating overhead after condition falls.
- These Gear-balance figures were produced before the reward reduction and are **historical / superseded**. They are not evidence that the current schedule creates a surplus.
- Typical and rough cases finish with only a modest cash reserve after all purchases. Cash remains the binding progression resource, and the model is deliberately not being used to justify another cost increase.
- Contract cadence is not fixed at one every 10 calls. It emerges from the five objective types: clean streaks can reset, plugs occur on one of five damage rolls, swaps on four of five, fast completions depend on player skill, and heavy contracts require a heavy vehicle **and** a swap. The simulated typical case averages about one completed contract every 7–8 calls; rough play takes longer.

### What this means for balancing

1. Do not increase upgrade, rig, or supply costs. The rough scenarios already extend the career substantially and leave little cash reserve.
2. Do not increase Gold Gear rewards yet. The reduced schedule is designed to bring typical long-run supply close to the 75-Gear progression requirement; the full revised Monte Carlo and live-playtest validation are still outstanding. Do not use the old surplus result to justify a change.
3. Keep free Surge use meaningful. Removing it increases the typical progression estimate by roughly 17% in the matched no-Surge run.
4. Preserve contract rewards, but make the claim state more noticeable in playtesting. A completed-but-unclaimed contract blocks the next assignment and its rewards.
5. Test inventory and cash-starvation recovery in a real browser before making further economy changes. The simulation does not yet model stockouts or a player who cannot afford a replacement kit/tire.


### Remaining validation

1. Add finite-stock, cargo-capacity, restock affordability, and cash-starvation recovery to the progression simulation; compare model results with real playtest telemetry.
2. Validate time-to-unlock for each tool tier, rig tier, and territory against intended career pacing.
3. Playtest low/average/high performance, contract-claim visibility, and players who miss or delay contract claims; verify the recovery path for low-cash players.
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
