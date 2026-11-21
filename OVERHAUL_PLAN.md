# DelWin Mobile Game — Full Overhaul Plan

## Safety rules

- All development happens on `full-overhaul`.
- The existing `main` branch and live GitHub Pages build remain untouched until the new build is tested and explicitly approved.
- Preserve the existing career progression and five-step roadside repair loop unless a change is required to fix a defect or the owner approves a redesign.
- Keep the game free during this overhaul. Do not add real-money purchases, paid subscriptions, or ad SDKs.
- Preserve and migrate existing `delwin_v4_save` career data; never silently reset a player's save.

## Confirmed repository baseline

The current `main` tree contains only five tracked files:

- `index.html`
- `game.js`
- `style.css`
- `audio.js`
- `README.md`

No image, font, or other asset files are currently tracked in the repository tree, even though `game.js` references many files under `assets/` (vehicle, rig, tire, and tool images). The current game therefore needs an asset inventory and fallback review before a visual overhaul can be considered complete.

The existing game is a static browser app. `index.html` loads `game.js` and `style.css`; it does not load `audio.js`. `game.js` already defines a `SoundFX` object of its own, separate from the implementation in `audio.js`.

The current save system uses browser `localStorage` with key `delwin_v4_save`. The save loader includes compatibility handling for an older `tires` field and clamps saved tool levels. This compatibility behavior must be retained or deliberately migrated and tested.

## Work phases

### 1. Stability and security
- Review all gameplay state transitions, timers, pointer/touch interactions, and error handling.
- Audit dynamic HTML rendering and validate/escape player-editable fields before inserting them into the DOM.
- Add safe save parsing, schema/version validation, backup/restore behavior, and migration tests.
- Check keyboard, touch, small-screen, and reduced-motion behavior.
- Identify missing asset references and ensure robust fallbacks.

### 2. Gameplay and visual quality
- Preserve the dispatch → repair bay → five-step repair loop and progression economy.
- Improve feedback, accessibility, responsive layout, and visual consistency.
- Rework the presentation only after confirming available art assets and intended art direction.
- Keep the experience free; monetization remains out of scope for this release.

### 3. Online accounts and cloud saves
- Select and document a backend before integrating it.
- Add account creation/sign-in, secure server-side authorization, and per-user cloud saves.
- Merge local career data safely on first sign-in and handle offline play/conflicts.
- Never trust client-submitted currency, inventory, rank, or reward calculations as authoritative.
- Do not store passwords, service-role secrets, or privileged API keys in client-side files.

### 4. Production readiness
- Add automated checks for JavaScript syntax, save migrations, and core game logic.
- Add a clear README with local run, deployment, and recovery instructions.
- Test the development branch independently of the live build.
- Open a reviewable pull request to `main` only after testing; do not merge or publish without owner approval.

## Initial findings to resolve

1. `audio.js` is currently not loaded by `index.html`, while `game.js` contains a separate sound implementation. Decide on one sound module and test mobile audio activation.
2. The repository tree has no tracked `assets/` directory, but the game references many asset paths. Confirm whether assets are missing or hosted elsewhere, then add or replace them with permission and reliable fallbacks.
3. The current `localStorage` save is device/browser-local, not an account or cloud save. Cloud sync requires a backend and a migration plan; it cannot be safely achieved by only changing the front-end.
4. Audit all dynamic `innerHTML` templates, especially player-editable business name and avatar fields, before adding account/profile features.

## Current status

- [x] Created isolated `full-overhaul` branch from `main`.
- [x] Captured initial repository tree and core-file baseline.
- [ ] Complete source audit and asset inventory.
- [ ] Add regression checks and safe save migration.
- [ ] Stabilize gameplay and UI.
- [ ] Implement account and cloud-save backend.
- [ ] Test development build and prepare review pull request.
