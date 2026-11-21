# DelWin Firebase Spark setup

This guide prepares the Firebase project used by the DelWin Mobile game. Keep the project on the **Spark (no-cost) plan**. Do not add a billing account.

## 1. Create the Firebase project

1. Open https://console.firebase.google.com/ and sign in with your Google account.
2. Select **Add project** and name it something recognizable, such as `delwin-mobile-game`.
3. Google Analytics is optional for this save feature; you can leave it off.
4. Finish creating the project. In Project settings, register a **Web app** (</>).
5. Give the app a nickname such as `DelWin Mobile Web`. Firebase Hosting is not required because the game is currently deployed as a static GitHub Pages app.
6. Copy the web app's Firebase configuration object. These web config values identify the Firebase project; they are not Admin credentials. Never copy or share a service-account JSON file, private key, or Admin SDK credential.

## 2. Enable Authentication

1. In Firebase Console, open **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Do not enable phone/SMS authentication; SMS verification can incur charges and is not needed.
4. Set the authorized domains to include the exact GitHub Pages host used by this game (for example, `honorbiz88-maker.github.io`). Add localhost only if you plan to test locally.

## 3. Create Cloud Firestore

1. Open **Build → Firestore Database → Create database**.
2. Choose production mode.
3. Choose a nearby region. The database region cannot easily be changed later, so choose deliberately.
4. After creation, open the **Rules** tab and replace the starter rules with the contents of `firestore.rules` in this repository.
5. Publish the rules.

The rules allow an authenticated player to read and write only:
`users/{their-auth-uid}/saves/current`.
They reject unauthenticated access and deny all other document access. Client-side validation is not a security boundary; Firestore rules are.

## 4. Spark plan and limits

Keep the project on Spark and do not link a Cloud Billing account. Standard Cloud Firestore currently includes a free allowance of 1 GiB stored data, 50,000 document reads/day, 20,000 document writes/day, and 10 GiB/month outbound transfer. If a Spark quota is exceeded, that product is unavailable for the rest of the calendar month. Check Firebase's live pricing documentation before launch:
https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

Authentication's common email/password sign-in is included at no cost on the base Firebase Authentication offering. Avoid phone authentication and optional paid Google Cloud services.

## 5. Save format and migration policy

The cloud document envelope will contain:
- `schemaVersion`: integer version for future migrations.
- `payload`: the complete DelWin career save.
- `updatedAt`: Firestore server timestamp.
- `deviceId`: non-sensitive per-install identifier used for conflict diagnostics.

The game must continue writing its existing `delwin_v4_save` localStorage key. On first sign-in:
- If only a local save exists, back it up locally before uploading it.
- If only a cloud save exists, validate and restore it locally.
- If both exist and differ, do not silently replace either. Present a clear choice to keep the local career or restore the cloud career, and retain a backup of the non-selected copy.
- Preserve the current `tires` → `stdTires` compatibility migration and existing tool-level bounds.

When offline, gameplay and local saving continue. Cloud sync is queued until the player is online and authenticated. Sync only after meaningful save events / a controlled debounce, not on every animation frame.

## 6. Security and product boundaries

- Never put a Firebase Admin SDK key, service-account JSON, private key, or privileged credential in browser code or Git.
- Firebase web configuration is expected to be present in a client app; access control is enforced by Authentication and Firestore Security Rules.
- Treat client save data as player-owned progress, not as verified competition results. Client-side currency, inventory, and reputation can be modified by a determined player. Do not use these client saves as authoritative prize or leaderboard records.
- Do not add paid purchases, ad SDKs, or monetization as part of this work.

## 7. Before implementation can connect

The Firebase project must exist and have Authentication + Firestore enabled. The next code step will add the web SDK configuration and account UI on the development branch, then test account creation, sign-in, first-time migration, cross-device restore, offline mode, and save conflicts.

Never paste passwords, verification codes, service-account files, or private keys into chat. If you need help with the Firebase console, share only the web app configuration object or the non-secret project/app identifiers requested by the implementation step.
