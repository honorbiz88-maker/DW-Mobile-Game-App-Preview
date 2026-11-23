import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC59uf0Z6MAg3w_zedb_LMJovcqOZKEMe4",
  authDomain: "delwin-mobile-game-overhaul.firebaseapp.com",
  projectId: "delwin-mobile-game-overhaul",
  storageBucket: "delwin-mobile-game-overhaul.firebasestorage.app",
  messagingSenderId: "281542224196",
  appId: "1:281542224196:web:d5e2747f3c7e9652cccf11"
};

const LOCAL_KEY = "delwin_v4_save";
const OWNER_KEY = "delwin_cloud_owner_uid";
const LOCAL_REVISION_KEY = "delwin_cloud_revision";
const SYNCED_SNAPSHOT_KEY = "delwin_cloud_synced_snapshot";
const SESSION_KEY = "delwin_session_id";
const SESSION_STARTED_KEY = "delwin_session_started_at";
const RESTORE_MARKER_KEY = "delwin_cloud_restore_pending";
const SCHEMA_VERSION = 1;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let syncReady = false;
let cloudRevision = 0;
let reconciliationRetryPending = false;
let syncTimer = null;
let cloudWatchUnsubscribe = null;
let cloudWatchUid = null;
let lastObservedCloudRevision = -1;
let pendingPayload = null;
let deferredCloudUpdate = null;
let busy = false;
let writing = false;
const reconcilingUids = new Set();

function status(message, error = false) {
  const el = document.getElementById("cloud-account-status");
  if (el) {
    el.textContent = message;
    el.style.color = error ? "#fca5a5" : "var(--muted)";
  }
}
function accountCard() {
  const card = document.getElementById("cloud-account-card");
  if (!card || card.dataset.bound === "true") return;
  card.dataset.bound = "true";
  const create = document.getElementById("cloud-create");
  const signin = document.getElementById("cloud-signin");
  const reset = document.getElementById("cloud-reset");
  const signout = document.getElementById("cloud-signout");
  const diagnose = document.getElementById("cloud-diagnose");
  diagnose?.addEventListener("click", async () => {
    status("Testing the Firebase Auth endpoint directly…");
    const result = await diagnoseAuthApiKey();
    status(result, /rejected|could not complete/i.test(result));
  });
  create?.addEventListener("click", async () => {
    const { email, password } = credentials();
    if (!email || password.length < 6) return status("Enter a valid email and a password of at least 6 characters.", true);
    await runAuth(() => createUserWithEmailAndPassword(auth, email, password), "Creating account…", null, "Account creation");
  });
  signin?.addEventListener("click", async () => {
    const { email, password } = credentials();
    if (!email || !password) return status("Enter your email and password.", true);
    await runAuth(() => signInWithEmailAndPassword(auth, email, password), "Signing in…", null, "Sign-in");
  });
  reset?.addEventListener("click", async () => {
    const { email } = credentials();
    if (!email) return status("Enter your email first, then choose Forgot password.", true);
    await runAuth(() => sendPasswordResetEmail(auth, email), "Sending password-reset email…", "Password-reset email sent. Check your inbox.", "Password reset");
  });
  signout?.addEventListener("click", async () => {
    await runAuth(() => signOut(auth), "Signing out…", "Signed out. This device's local career is still saved.", "Sign-out");
  });
}
function credentials() {
  return {
    email: document.getElementById("cloud-email")?.value.trim() || "",
    password: document.getElementById("cloud-password")?.value || ""
  };
}
async function diagnoseAuthApiKey() {
  try {
    // Deliberately invalid credentials ensure this probe cannot create an account.
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + encodeURIComponent(firebaseConfig.apiKey),
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "diagnostic-invalid-email", password: "x", returnSecureToken: true }) }
    );
    const result = await response.json().catch(() => ({}));
    const backendCode = result?.error?.message || ("HTTP " + response.status);
    if (/API_KEY_INVALID|API key not valid|API_KEY_SERVICE_BLOCKED/i.test(backendCode)) {
      return "Direct Identity Toolkit probe also rejected the configured key: " + backendCode + ".";
    }
    return "Direct Identity Toolkit probe reached Firebase; safe invalid-input check returned: " + backendCode + ".";
  } catch (error) {
    return "Direct Identity Toolkit probe could not complete: " + (error.message || "network error") + ".";
  }
}
async function runAuth(action, pendingMessage, successMessage, operation = "Authentication") {
  status(pendingMessage);
  try {
    await action();
    if (successMessage) status(successMessage);
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "That email already has an account. Sign in instead.",
      "auth/invalid-email": "That email address is not valid.",
      "auth/weak-password": "Choose a stronger password (at least 6 characters).",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/user-not-found": "No account was found for that email.",
      "auth/too-many-requests": "Too many attempts. Wait a while and try again.",
      "auth/network-request-failed": "Network error. Check your connection and try again.",
      "auth/operation-not-allowed": "Email and password sign-in is not enabled for this game yet. Please try again later."
    };
    const detail = messages[error.code] || error.message || "Account request failed.";
    // The probe uses invalid credentials, so it cannot create an account.
    const keyDiagnostic = error.code === "auth/api-key-not-valid.-please-pass-a-valid-api-key."
      ? " " + await diagnoseAuthApiKey()
      : "";
    // Show a safe diagnostic without exposing credentials or request URLs.
    status(`${operation} failed [${error.code || "unknown"}]: ${detail}${keyDiagnostic}`, true);
  }
}
function localSnapshot() {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { raw, payload: parsed, ownerUid: localStorage.getItem(OWNER_KEY) } : { raw, invalid: true };
  } catch {
    status("The local career save could not be read. It has not been changed; contact support before resetting browser data.", true);
    return { raw, invalid: true };
  }
}
function backupLocal(raw, suffix = "before-cloud-change") {
  const key = `delwin_backup_${suffix}_${Date.now()}`;
  localStorage.setItem(key, raw);
  return key;
}
function saveEnvelope(payload, revision, checkpoint = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    payload,
    revision,
    updatedAt: serverTimestamp(),
    deviceId: getDeviceId(),
    sessionId: getSessionId(),
    sessionStartedAt: Number(localStorage.getItem(SESSION_STARTED_KEY)) || Date.now(),
    clientSavedAt: Date.now(),
    checkpointType: typeof checkpoint.type === "string" ? checkpoint.type : "gameplay"
  };
}
function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    sessionStorage.setItem(SESSION_KEY, id);
    const started = String(Date.now());
    sessionStorage.setItem(SESSION_STARTED_KEY, started);
    localStorage.setItem(SESSION_STARTED_KEY, started);
  }
  return id;
}
function getDeviceId() {
  let id = localStorage.getItem("delwin_device_id");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `dw-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem("delwin_device_id", id);
  }
  return id;
}
function showConflict(localRaw, cloudData, localOwnerUid = currentUser?.uid || null) {
  const open = window.openModal;
  if (typeof open !== "function") {
    status("A local and cloud career both exist. Open the menu again to resolve the save conflict.", true);
    return;
  }
  const date = cloudData.updatedAt?.toDate ? cloudData.updatedAt.toDate().toLocaleString() : "date unavailable";
  open(`
    <span class="badge">SAVE CONFLICT</span>
    <h3>Two career saves found</h3>
    <p style="font-size:12px;color:var(--muted);">This device has a local career and your account has a different cloud career (last cloud update: ${date}). Neither copy has been changed.</p>
    ${localOwnerUid && currentUser?.uid && localOwnerUid !== currentUser.uid
      ? '<p style="font-size:12px;color:var(--muted);">This device career is linked to a different account. It cannot be uploaded to the account currently signed in.</p>'
      : '<button class="primary-btn" onclick="window.DelWinCloud.keepLocal()">KEEP THIS DEVICE\'S CAREER</button>'}
    <button class="secondary-btn" onclick="window.DelWinCloud.keepCloud()">RESTORE CLOUD CAREER</button>
    <p style="font-size:10px;color:var(--muted);">The device career will be backed up on this device before the cloud career replaces it.</p>
  `);
  window.DelWinCloud.pendingConflict = { localRaw, cloudData, uid: currentUser?.uid || null, localOwnerUid };
}
async function writeCloud(payload, expectedUid = currentUser?.uid, expectedRevision = cloudRevision, checkpoint = {}) {
  if (!expectedUid || !currentUser || currentUser.uid !== expectedUid) {
    throw new Error("Account changed before the save could sync. Your local career is safe.");
  }
  const ref = doc(db, "users", expectedUid, "saves", "current");
  const nextRevision = expectedRevision + 1;
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    const data = snap.exists() ? snap.data() : null;
    const actualRevision = Number.isSafeInteger(data?.revision) ? data.revision : 0;
    if (actualRevision !== expectedRevision) {
      const conflict = new Error("A newer cloud career was saved on another device. Your local progress has been kept; choose which career to keep.");
      conflict.code = "save/revision-conflict";
      throw conflict;
    }
    if (!currentUser || currentUser.uid !== expectedUid) {
      throw new Error("Account changed before the save could sync. Your local career is safe.");
    }
    transaction.set(ref, saveEnvelope(payload, nextRevision, checkpoint));
  });
  if (currentUser?.uid === expectedUid) {
    cloudRevision = nextRevision;
    if (localStorage.getItem(OWNER_KEY) === expectedUid) {
      localStorage.setItem(LOCAL_REVISION_KEY, String(nextRevision));
      localStorage.setItem(SYNCED_SNAPSHOT_KEY, JSON.stringify(payload));
    }
  }
  return nextRevision;
}
function tryApplyNewerCloud(cloud, local) {
  const payload = cloud?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  let baseline = null;
  try { baseline = JSON.parse(localStorage.getItem(SYNCED_SNAPSHOT_KEY) || 'null'); } catch {}
  if (!baseline || JSON.stringify(local.payload) !== JSON.stringify(baseline)) return false;
  const apply = window.DelWinApplyCloudSave;
  if (typeof apply !== 'function' || !apply(payload)) { deferredCloudUpdate = cloud; return true; }
  const revision = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
  cloudRevision = revision; lastObservedCloudRevision = Math.max(lastObservedCloudRevision, revision);
  localStorage.setItem(LOCAL_REVISION_KEY, String(revision));
  localStorage.setItem(SYNCED_SNAPSHOT_KEY, JSON.stringify(payload));
  pendingPayload = null; status('Cloud career updated.'); return true;
}
function processDeferredCloudUpdate() {
  if (!deferredCloudUpdate || !currentUser || !syncReady) return;
  const cloud = deferredCloudUpdate; deferredCloudUpdate = null;
  const local = localSnapshot(); if (!local || local.invalid) return;
  const revision = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
  const localRevision = Number.parseInt(localStorage.getItem(LOCAL_REVISION_KEY) || '0', 10) || 0;
  if (revision <= localRevision) return;
  if (tryApplyNewerCloud(cloud, local)) return;
  syncReady = false; pendingPayload = null; cloudRevision = revision;
  showConflict(local.raw, cloud, local.ownerUid);
  status('Both devices have made progress. Both saves are preserved; choose which career to keep.', true);
}
function watchCloud(user) {
  if (cloudWatchUid === user.uid && cloudWatchUnsubscribe) return;
  cloudWatchUnsubscribe?.();
  cloudWatchUnsubscribe = null;
  cloudWatchUid = user.uid;
  lastObservedCloudRevision = -1;
  const ref = doc(db, "users", user.uid, "saves", "current");
  cloudWatchUnsubscribe = onSnapshot(ref, snap => {
    if (!currentUser || currentUser.uid !== user.uid || !syncReady || !snap.exists()) return;
    const cloud = snap.data();
    if (cloud?.schemaVersion !== SCHEMA_VERSION || !cloud.payload || typeof cloud.payload !== "object" || Array.isArray(cloud.payload)) return;
    const revision = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
    if (revision <= lastObservedCloudRevision) return;
    lastObservedCloudRevision = revision;
    const local = localSnapshot();
    if (!local || local.invalid) return;
    const localRevision = Number.parseInt(localStorage.getItem(LOCAL_REVISION_KEY) || "0", 10) || 0;
    if (revision > localRevision && JSON.stringify(local.payload) !== JSON.stringify(cloud.payload)) {
      cloudRevision = revision;
      if (tryApplyNewerCloud(cloud, local)) return;
      syncReady = false;
      pendingPayload = null;
      showConflict(local.raw, cloud, local.ownerUid);
      status("Both devices have made progress. Both saves are preserved; choose which career to keep.", true);
    } else if (JSON.stringify(local.payload) === JSON.stringify(cloud.payload)) {
      localStorage.setItem(LOCAL_REVISION_KEY, String(revision));
      cloudRevision = revision;
    }
  }, error => {
    if (currentUser?.uid === user.uid) status("Live cloud updates paused. Your local career remains safe.", true);
  });
}

async function reconcile(user) {
  if (reconcilingUids.has(user.uid)) return;
  reconcilingUids.add(user.uid);
  syncReady = false;
  reconciliationRetryPending = false;
  busy = true;
  status("Connecting cloud backup…");
  try {
    const ref = doc(db, "users", user.uid, "saves", "current");
    const snap = await getDoc(ref);
    // Ignore stale responses if the player changed accounts during the request.
    if (!currentUser || currentUser.uid !== user.uid) return;
    const local = localSnapshot();
    if (local?.invalid) return;

    // Honor an explicit Restore Cloud choice. This is the only normal path
    // allowed to replace a device save and reload the game.
    let restoreMarker = null;
    try { restoreMarker = JSON.parse(localStorage.getItem(RESTORE_MARKER_KEY) || "null"); } catch {}
    if (restoreMarker?.uid === user.uid) {
      const selectedPayload = restoreMarker.cloudPayload && typeof restoreMarker.cloudPayload === "object" && !Array.isArray(restoreMarker.cloudPayload)
        ? restoreMarker.cloudPayload
        : (snap.exists() ? snap.data()?.payload : null);
      if (!selectedPayload || typeof selectedPayload !== "object" || Array.isArray(selectedPayload)) {
        status("The selected cloud career is unavailable. Your device career has not been changed.", true);
        return;
      }
      const cloudPayload = JSON.stringify(selectedPayload);
      const localMatchesCloud = !!local && JSON.stringify(local.payload) === cloudPayload;
      localStorage.setItem(OWNER_KEY, user.uid);
      if (!localMatchesCloud) {
        if (local) backupLocal(local.raw, "restore-reconciliation");
        localStorage.setItem(LOCAL_KEY, cloudPayload);
        syncReady = false;
        status("Cloud career restored. Your previous device career remains backed up.");
        location.reload();
      } else {
        localStorage.removeItem(RESTORE_MARKER_KEY);
        localStorage.setItem(LOCAL_REVISION_KEY, String(Number.isSafeInteger(snap.data()?.revision) ? snap.data().revision : cloudRevision));
        syncReady = true;
        status("Cloud career restored and connected.");
      }
      return;
    }

    // Never allow one account to claim another account's device career.
    if (local?.ownerUid && local.ownerUid !== user.uid) {
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData?.schemaVersion === SCHEMA_VERSION && cloudData.payload && typeof cloudData.payload === "object" && !Array.isArray(cloudData.payload)) {
          showConflict(local.raw, cloudData, local.ownerUid);
          status("This device's career belongs to a different account. You may restore this account's cloud career; the device career will be backed up first.", true);
        } else {
          status("This device's career belongs to a different account, and the cloud save format is not recognized. Nothing was changed.", true);
        }
      } else {
        status("This device's career belongs to a different account. Nothing was uploaded. Sign back into its original account or use another device for this account.", true);
      }
      return;
    }

    const cloud = snap.exists() ? snap.data() : null;
    cloudRevision = Number.isSafeInteger(cloud?.revision) ? cloud.revision : 0;
    if (cloud && (cloud.schemaVersion !== SCHEMA_VERSION || !cloud.payload || typeof cloud.payload !== "object" || Array.isArray(cloud.payload))) {
      status("The cloud save format is not recognized. Nothing was overwritten; ask for help before proceeding.", true);
      return;
    }

    // A device that already belongs to this account keeps playing its local
    // career. Do not compare full saves, replace local data, or reload on startup.
    // Each gameplay save is written locally first and queued for background backup.
    if (local?.ownerUid === user.uid) {
      if (!cloud) {
        // Recover a missing cloud document from the already-linked local career.
        // This is a one-time background seed, never a save-selection prompt.
        await writeCloud(local.payload, user.uid, cloudRevision);
        if (!currentUser || currentUser.uid !== user.uid) return;
        status("Cloud backup reconnected from this device's saved career.");
      } else {
        const cloudRevisionOnServer = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
        const localRevision = Number.parseInt(localStorage.getItem(LOCAL_REVISION_KEY) || "0", 10) || 0;
        const localMatchesCloud = JSON.stringify(local.payload) === JSON.stringify(cloud.payload);
        if (cloudRevisionOnServer > localRevision && !localMatchesCloud) {
          if (tryApplyNewerCloud(cloud, local)) {
            status("Your latest cloud career was restored in the background.");
          } else {
            showConflict(local.raw, cloud, local.ownerUid);
            status("Both devices have made progress. Both saves are preserved; choose which career to keep.", true);
            return;
          }
        }
        if (localMatchesCloud || cloudRevisionOnServer === localRevision) {
          localStorage.setItem(LOCAL_REVISION_KEY, String(cloudRevisionOnServer));
          if (localMatchesCloud) localStorage.setItem(SYNCED_SNAPSHOT_KEY, JSON.stringify(cloud.payload));
        }
        status("Cloud backup connected · this device is ready.");
      }
      syncReady = true;
      return;
    }

    // Account creation on a device with an existing guest career: link and back
    // up that career when this account has no cloud save yet.
    if (local && !cloud) {
      // Claim the guest career before the first network write. If the request
      // fails or the account changes mid-flight, another account cannot adopt it.
      localStorage.setItem(OWNER_KEY, user.uid);
      await writeCloud(local.payload, user.uid);
      if (!currentUser || currentUser.uid !== user.uid) return;
      syncReady = true;
      status("Your existing device career is now backed up to your account.");
      return;
    }

    // An unlinked guest career and an existing account career are two distinct
    // saves. Preserve both and ask only at this account-link boundary.
    if (local && cloud) {
      showConflict(local.raw, cloud);
      status("A device career and an account career both exist. Neither has been changed.", true);
      return;
    }

    // A genuinely new device has no local career, so restore the account save
    // once. The reload is only to initialize the game's in-memory state.
    if (!local && cloud) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(cloud.payload));
      localStorage.setItem(OWNER_KEY, user.uid);
      localStorage.setItem(LOCAL_REVISION_KEY, String(Number.isSafeInteger(cloud.revision) ? cloud.revision : 0));
      status("Cloud career restored to this device.");
      location.reload();
      return;
    }

    // Brand-new account and device: establish ownership before allowing sync.
    localStorage.setItem(OWNER_KEY, user.uid);
    syncReady = true;
    status("Account connected. Your career will sync after your first save.");
  } catch (error) {
    if (currentUser?.uid === user.uid) reconciliationRetryPending = true;
    status(`Cloud connection failed: ${error.message}. Your local career remains available.`, true);
  } finally {
    if (currentUser?.uid === user.uid) {
      busy = false;
      if (syncReady) watchCloud(user);
    }
    reconcilingUids.delete(user.uid);
  }
}
async function keepLocal() {
  const pending = window.DelWinCloud.pendingConflict;
  if (!pending || !currentUser || pending.uid !== currentUser.uid) return;
  if (pending.localOwnerUid && pending.localOwnerUid !== pending.uid) {
    status("This device's career belongs to another account. It cannot be uploaded to this account.", true);
    return;
  }
  try {
    if (pending.cloudData) {
      localStorage.setItem(`delwin_cloud_backup_${currentUser.uid}_${Date.now()}`, JSON.stringify(pending.cloudData));
    }
    await writeCloud(JSON.parse(pending.localRaw), pending.uid, cloudRevision);
    if (!currentUser || currentUser.uid !== pending.uid) return;
    localStorage.setItem(OWNER_KEY, pending.uid);
    localStorage.setItem(LOCAL_REVISION_KEY, String(cloudRevision));
    syncReady = true;
    window.DelWinCloud.pendingConflict = null;
    window.closeModal?.();
    status("Local career selected. The previous cloud copy is backed up on this device.");
  } catch (error) {
    status(`Could not keep the local career: ${error.message}`, true);
  }
}
function keepCloud() {
  const pending = window.DelWinCloud.pendingConflict;
  if (!pending || !currentUser || pending.uid !== currentUser.uid) return;
  try {
    backupLocal(pending.localRaw);
    const cloudRevision = pending.cloudData.updatedAt?.toMillis ? pending.cloudData.updatedAt.toMillis() : null;
    // The restore decision is bound to the exact cloud payload, so it survives
    // reloads even when a legacy/migrated Firestore document has no Timestamp.
    localStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({
      uid: currentUser.uid,
      revision: cloudRevision,
      deviceId: getDeviceId(),
      cloudPayload: pending.cloudData.payload
    }));
    localStorage.setItem(LOCAL_KEY, JSON.stringify(pending.cloudData.payload));
    localStorage.setItem(OWNER_KEY, currentUser.uid);
    localStorage.setItem(LOCAL_REVISION_KEY, String(Number.isSafeInteger(pending.cloudData.revision) ? pending.cloudData.revision : cloudRevision));
    window.DelWinCloud.pendingConflict = null;
    syncReady = true;
    window.closeModal?.();
    location.reload();
  } catch (error) {
    status(`Could not restore cloud career: ${error.message}`, true);
  }
}
function pendingBelongsToUser(pending, user) {
  return !!pending && !!user && pending.uid === user.uid;
}
async function flushPendingSave(expectedUid) {
  if (writing) return;
  if (!pendingBelongsToUser(pendingPayload, currentUser) || currentUser.uid !== expectedUid || !syncReady || !navigator.onLine) return;
  if (busy) {
    syncTimer = setTimeout(() => flushPendingSave(expectedUid), 1400);
    return;
  }
  writing = true;
  const next = pendingPayload.payload;
  pendingPayload = null;
  syncTimer = null;
  let retryDelay = 1400;
  try {
    await writeCloud(next, expectedUid, cloudRevision, pendingPayload?.checkpoint || {});
    if (currentUser?.uid === expectedUid) {
      let restoreMarker = null;
      try { restoreMarker = JSON.parse(localStorage.getItem(RESTORE_MARKER_KEY) || "null"); } catch {}
      if (restoreMarker?.uid === expectedUid) localStorage.removeItem(RESTORE_MARKER_KEY);
      status("Cloud save synced.");
    }
  } catch (error) {
    if (error.code === "save/revision-conflict" && currentUser?.uid === expectedUid) {
      // Stop automatic writes and present both copies. A player must explicitly
      // choose; an older/offline device can never silently replace newer cloud progress.
      syncReady = false;
      pendingPayload = null;
      try {
        const latest = await getDoc(doc(db, "users", expectedUid, "saves", "current"));
        if (currentUser?.uid !== expectedUid) return;
        const cloudData = latest.exists() ? latest.data() : null;
        if (cloudData?.payload && typeof cloudData.payload === "object" && !Array.isArray(cloudData.payload)) {
          cloudRevision = Number.isSafeInteger(cloudData.revision) ? cloudData.revision : 0;
          const local = localSnapshot();
          if (local && !local.invalid) showConflict(local.raw, cloudData, local.ownerUid);
        }
      } catch {}
      status("A newer cloud career exists. Your device progress is safe; choose which career to keep before syncing again.", true);
    } else if (currentUser?.uid === expectedUid && syncReady) {
      // Keep the newest queued state; otherwise retry the failed snapshot.
      if (!pendingBelongsToUser(pendingPayload, currentUser)) {
        pendingPayload = { uid: expectedUid, payload: next };
      }
      retryDelay = 5000;
      status(`Cloud sync delayed: ${error.message}. Your local career is safe; retrying automatically.`, true);
    } else if (currentUser?.uid === expectedUid) {
      status(`Cloud sync paused: ${error.message}. Your local career is safe.`, true);
    }
  } finally {
    writing = false;
    if (currentUser && syncReady && navigator.onLine && pendingBelongsToUser(pendingPayload, currentUser)) {
      clearTimeout(syncTimer);
      const nextUid = currentUser.uid;
      syncTimer = setTimeout(() => flushPendingSave(nextUid), retryDelay);
    }
  }
}
function queueSave(payload, metadata = {}) {
  if (!currentUser || !syncReady) return;
  let restoreMarker = null;
  try { restoreMarker = JSON.parse(localStorage.getItem(RESTORE_MARKER_KEY) || "null"); } catch {}
  if (restoreMarker?.uid === currentUser.uid) {
    status("Cloud restore is being finalized. The selected cloud career cannot be overwritten yet.");
    return;
  }
  if (localStorage.getItem(OWNER_KEY) !== currentUser.uid) {
    status("Cloud sync paused: this device's career belongs to a different account.", true);
    return;
  }
  const queuedUid = currentUser.uid;
  pendingPayload = { uid: queuedUid, payload: JSON.parse(JSON.stringify(payload)), checkpoint: { type: metadata.checkpointType || "gameplay" } };
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => flushPendingSave(queuedUid), 1400);
}
function isRestorePending() {
  try {
    const marker = JSON.parse(localStorage.getItem(RESTORE_MARKER_KEY) || "null");
    // game.js boots before Firebase finishes restoring auth. The durable marker
    // must still block startup writes during that unauthenticated interval.
    return !!marker?.uid && (!currentUser || marker.uid === currentUser.uid);
  } catch {
    return false;
  }
}
window.DelWinCloud = { queueSave, keepLocal, keepCloud, onSafeCheckpoint: processDeferredCloudUpdate, signOut: () => signOut(auth), hasAccount: () => !!currentUser, isRestorePending, pendingConflict: null };
window.addEventListener("online", () => {
  if (!currentUser || !navigator.onLine) return;
  // Retry only an authentication setup that previously failed. Healthy
  // sessions never re-read Firestore or re-run save selection on reconnect.
  if (!syncReady) {
    if (reconciliationRetryPending && !busy) void reconcile(currentUser);
    return;
  }
  const uid = currentUser.uid;
  clearTimeout(syncTimer);
  syncTimer = null;
  void flushPendingSave(uid);
});
accountCard();

onAuthStateChanged(auth, user => {
    const previousUid = currentUser?.uid || null;
    const nextUid = user?.uid || null;
    if (previousUid !== nextUid) {
      cloudWatchUnsubscribe?.();
      cloudWatchUnsubscribe = null;
      cloudWatchUid = null;
      lastObservedCloudRevision = -1;
      clearTimeout(syncTimer);
      syncTimer = null;
      pendingPayload = null;
      window.DelWinCloud && (window.DelWinCloud.pendingConflict = null);
      busy = false;
      reconciliationRetryPending = false;
    }
    currentUser = user;
    syncReady = false;
    const signedOut = document.getElementById("cloud-signed-out");
    const signedIn = document.getElementById("cloud-signed-in");
    if (signedOut) signedOut.hidden = !!user;
    if (signedIn) signedIn.hidden = !user;
    const email = document.getElementById("cloud-user-email");
    if (email) email.textContent = user ? `Signed in as ${user.email || "player"}` : "";
    if (user) reconcile(user);
    else status("Sign in to back up your career across devices.");
});
