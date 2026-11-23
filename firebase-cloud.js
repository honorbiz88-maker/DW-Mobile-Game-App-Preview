import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager, doc, getDoc, onSnapshot, runTransaction, serverTimestamp
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
const OUTBOX_KEY = "delwin_cloud_pending_outbox_v1";
const SCHEMA_VERSION = 1;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Use Firebase's durable IndexedDB cache and multi-tab coordination where the
// browser supports it. The game save remains local-first; this cache is an
// additional Firebase layer, not the source of truth for active gameplay.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (error) {
  // Unsupported browsers or an already-initialized Firestore instance retain
  // the safe memory-cache fallback; local career saving remains operational.
  db = getFirestore(app);
}
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
function isStarterCareer(payload) {
  if (!payload || typeof payload !== "object") return false;
  const toolLevels = payload.tools && typeof payload.tools === "object"
    ? Object.values(payload.tools).every(tool => !tool || Number(tool.level) === 1)
    : false;
  const tutorialOnly = !payload.activeJob || payload.activeJob.isTutorial === true;
  return payload.jobsCompleted === 0
    && payload.cash === 140
    && (payload.tokens === 8 || payload.tokens === 20)
    && (payload.parts || 0) === 0
    && (payload.rep || 0) === 0
    && (payload.unlockedRigTier || 1) === 1
    && payload.zoneId === "z1"
    && payload.plugs === 4
    && payload.stdTires === 2
    && payload.hdTires === 1
    && (payload.streak || 0) === 0
    && (payload.contractsCompleted || 0) === 0
    && (!payload.customerLedger || Object.keys(payload.customerLedger).length === 0)
    && (!Array.isArray(payload.claimedCareerGearMilestones) || payload.claimedCareerGearMilestones.length === 0)
    && (!Array.isArray(payload.jobs) || payload.jobs.length === 0)
    && tutorialOnly
    && toolLevels;
}
function restoreCloudCareer(local, cloudData, uid, backupSuffix) {
  backupLocal(local.raw, backupSuffix);
  const revision = Number.isSafeInteger(cloudData.revision) ? cloudData.revision : 0;
  const payload = cloudData.payload;
  localStorage.setItem(RESTORE_MARKER_KEY, JSON.stringify({
    uid, revision, deviceId: getDeviceId(), cloudPayload: payload
  }));
  localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  localStorage.setItem(OWNER_KEY, uid);
  localStorage.setItem(LOCAL_REVISION_KEY, String(revision));
  localStorage.setItem(SYNCED_SNAPSHOT_KEY, JSON.stringify(payload));
  status("This browser is being connected to your account's cloud career. Its previous local save has been backed up.");
  location.reload();
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
    status("Your device save is preserved. Open the account menu to resolve synchronization.", true);
    return;
  }
  const date = cloudData.updatedAt?.toDate ? cloudData.updatedAt.toDate().toLocaleString() : "date unavailable";
  open(`
    <span class="badge">SAVE SYNC</span>
    <h3>Device progress protected</h3>
    <p style="font-size:12px;color:var(--muted);">This device has a career that differs from the account backup (last cloud update: ${date}). Your device career remains the active save. Neither save has been replaced.</p>
    ${localOwnerUid && currentUser?.uid && localOwnerUid !== currentUser.uid
      ? '<p style="font-size:12px;color:var(--muted);">This device career belongs to a different account and will not be uploaded to the account currently signed in.</p>'
      : '<button class="primary-btn" onclick="window.DelWinCloud.keepLocal()">KEEP DEVICE SAVE AND BACK UP</button>'}
    <p style="font-size:10px;color:var(--muted);">Cloud restoration is reserved for a new device without an established local career. An older cloud timestamp will never replace an established device career.</p>
    <button type="button" class="secondary-btn" onclick="window.closeModal()">CONTINUE WITH DEVICE CAREER</button>
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
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
  }
  return value;
}
function sameValue(a, b) {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
}
// Three-way merge only accepts independent field changes. If both devices
// changed the same top-level field differently, preserve both saves and ask.
function mergeCareerSaves(base, local, cloud) {
  if (!base || !local || !cloud) return { ok: false, conflicts: ["unknown baseline"] };
  const merged = {};
  const conflicts = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)]);
  for (const key of keys) {
    const hasBase = Object.prototype.hasOwnProperty.call(base, key);
    const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
    const hasCloud = Object.prototype.hasOwnProperty.call(cloud, key);
    const b = hasBase ? base[key] : undefined;
    const l = hasLocal ? local[key] : undefined;
    const c = hasCloud ? cloud[key] : undefined;
    const localChanged = hasBase !== hasLocal || !sameValue(b, l);
    const cloudChanged = hasBase !== hasCloud || !sameValue(b, c);
    if (!localChanged) {
      if (hasCloud) merged[key] = c;
    } else if (!cloudChanged || (hasLocal === hasCloud && sameValue(l, c))) {
      if (hasLocal) merged[key] = l;
    } else {
      conflicts.push(key);
    }
  }
  return conflicts.length ? { ok: false, conflicts } : { ok: true, payload: merged };
}
function readSyncedBaseline() {
  try {
    const value = JSON.parse(localStorage.getItem(SYNCED_SNAPSHOT_KEY) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function readDurableOutbox() {
  try {
    const value = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "null");
    return value && typeof value === "object" && typeof value.uid === "string" && value.payload && typeof value.payload === "object" && !Array.isArray(value.payload)
      ? value : null;
  } catch { return null; }
}
function persistDurableOutbox(uid, payload, checkpointType = "gameplay") {
  if (!uid || !payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify({
      uid, payload, checkpointType, queuedAt: Date.now()
    }));
    return true;
  } catch (error) {
    status("Your device save is current, but its cloud backup queue could not be stored: " + error.message, true);
    return false;
  }
}
function clearDurableOutboxIfMatches(uid, payload) {
  const queued = readDurableOutbox();
  if (queued?.uid === uid && sameValue(queued.payload, payload)) {
    localStorage.removeItem(OUTBOX_KEY);
  }
}
function activateDurableOutbox(uid) {
  if (!currentUser || currentUser.uid !== uid || !syncReady) return;
  const local = localSnapshot();
  if (!local || local.invalid || local.ownerUid !== uid) return;
  const baseline = readSyncedBaseline();
  if (baseline && sameValue(local.payload, baseline)) {
    const queued = readDurableOutbox();
    if (queued?.uid === uid) localStorage.removeItem(OUTBOX_KEY);
    return;
  }
  // The local career is authoritative. Rebuild the durable outbox from it
  // instead of trusting a possibly stale in-memory timer or old queue entry.
  persistDurableOutbox(uid, local.payload, "recovered-local-outbox");
  pendingPayload = {
    uid, payload: JSON.parse(JSON.stringify(local.payload)),
    checkpoint: { type: "recovered-local-outbox" }
  };
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => flushPendingSave(uid), 300);
}
function queueMergedUpload(payload) {
  if (!currentUser) return;
  persistDurableOutbox(currentUser.uid, payload, "auto-merge");
  pendingPayload = { uid: currentUser.uid, payload: JSON.parse(JSON.stringify(payload)), checkpoint: { type: "auto-merge" } };
  syncReady = true;
  clearTimeout(syncTimer);
  const uid = currentUser.uid;
  syncTimer = setTimeout(() => flushPendingSave(uid), 300);
}
function applyMergedCareer(payload, revision, cloudData) {
  cloudRevision = revision;
  const apply = window.DelWinApplyCloudSave;
  if (typeof apply === "function" && apply(payload)) {
    deferredCloudUpdate = null;
    localStorage.setItem(LOCAL_REVISION_KEY, String(revision));
    status("Career changes from both devices were safely combined.");
    queueMergedUpload(payload);
  } else {
    deferredCloudUpdate = { ...cloudData, revision, mergedPayload: payload };
    syncReady = true;
    status("Changes from both devices were combined and will appear at the next safe gameplay checkpoint.");
  }
}
function tryMergeConcurrentCareer(cloud, local) {
  const baseline = readSyncedBaseline();
  if (!baseline || !local?.payload || !cloud?.payload) return false;
  const result = mergeCareerSaves(baseline, local.payload, cloud.payload);
  if (!result.ok) return false;
  const revision = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
  applyMergedCareer(result.payload, revision, cloud);
  return true;
}
function tryApplyNewerCloud(cloud, local) {
  const payload = cloud?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  let baseline = null;
  try { baseline = JSON.parse(localStorage.getItem(SYNCED_SNAPSHOT_KEY) || 'null'); } catch {}
  if (!baseline || !sameValue(local.payload, baseline)) return false;
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
  const cloud = deferredCloudUpdate;
  const local = localSnapshot(); if (!local || local.invalid) return;
  if (cloud.mergedPayload) {
    const apply = window.DelWinApplyCloudSave;
    if (typeof apply === "function" && apply(cloud.mergedPayload)) {
      deferredCloudUpdate = null;
      localStorage.setItem(LOCAL_REVISION_KEY, String(cloud.revision || 0));
      status("Combined career changes are now active.");
      queueMergedUpload(cloud.mergedPayload);
    }
    return;
  }
  deferredCloudUpdate = null;
  const revision = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
  const localRevision = Number.parseInt(localStorage.getItem(LOCAL_REVISION_KEY) || '0', 10) || 0;
  if (revision <= localRevision) return;
  if (tryApplyNewerCloud(cloud, local)) return;
  if (tryMergeConcurrentCareer(cloud, local)) return;
  syncReady = false; pendingPayload = null; cloudRevision = revision;
  showConflict(local.raw, cloud, local.ownerUid);
  status('Both devices changed the same career data. Both saves are preserved; choose which career to keep.', true);
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
    if (revision > localRevision && !sameValue(local.payload, cloud.payload)) {
      cloudRevision = revision;
      if (tryApplyNewerCloud(cloud, local)) return;
      if (tryMergeConcurrentCareer(cloud, local)) return;
      syncReady = false;
      pendingPayload = null;
      showConflict(local.raw, cloud, local.ownerUid);
      status("Both devices changed the same career data. Both saves are preserved; choose which career to keep.", true);
    } else if (sameValue(local.payload, cloud.payload)) {
      localStorage.setItem(LOCAL_REVISION_KEY, String(revision));
      cloudRevision = revision;
    }
  }, error => {
    if (currentUser?.uid === user.uid) status("Live cloud updates paused. Your local career remains safe.", true);
  });
}

// Each authenticated account gets its own device-local career and sync metadata.
// The shared legacy keys below are only the active-account working slot.
function accountStorageKey(uid, suffix) { return `delwin_account_${uid}_${suffix}`; }
function switchActiveAccountIfNeeded(user) {
  const ownerUid = localStorage.getItem(OWNER_KEY);
  if (!ownerUid || ownerUid === user.uid) return false;
  const raw = localStorage.getItem(LOCAL_KEY);
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid local career");
      // Archive the outgoing account before changing a single active key.
      localStorage.setItem(accountStorageKey(ownerUid, "career"), raw);
      localStorage.setItem(accountStorageKey(ownerUid, "revision"), localStorage.getItem(LOCAL_REVISION_KEY) || "0");
      const baseline = localStorage.getItem(SYNCED_SNAPSHOT_KEY);
      if (baseline) localStorage.setItem(accountStorageKey(ownerUid, "baseline"), baseline);
      const outbox = readDurableOutbox();
      if (outbox?.uid === ownerUid) localStorage.setItem(accountStorageKey(ownerUid, "outbox"), JSON.stringify(outbox));
    }
    const incomingCareer = localStorage.getItem(accountStorageKey(user.uid, "career"));
    const incomingBaseline = localStorage.getItem(accountStorageKey(user.uid, "baseline"));
    const incomingOutbox = localStorage.getItem(accountStorageKey(user.uid, "outbox"));
    // Validate the incoming snapshot before installing it in the active slot.
    if (incomingCareer) {
      const parsedIncoming = JSON.parse(incomingCareer);
      if (!parsedIncoming || typeof parsedIncoming !== "object" || Array.isArray(parsedIncoming)) throw new Error("Invalid saved career for this account");
    }
    if (raw) backupLocal(raw, "account-switch-" + ownerUid);
    if (incomingCareer) {
      localStorage.setItem(LOCAL_KEY, incomingCareer);
      localStorage.setItem(OWNER_KEY, user.uid);
      localStorage.setItem(LOCAL_REVISION_KEY, localStorage.getItem(accountStorageKey(user.uid, "revision")) || "0");
      if (incomingBaseline) localStorage.setItem(SYNCED_SNAPSHOT_KEY, incomingBaseline);
      else localStorage.removeItem(SYNCED_SNAPSHOT_KEY);
    } else {
      localStorage.removeItem(LOCAL_KEY);
      localStorage.removeItem(OWNER_KEY);
      localStorage.removeItem(LOCAL_REVISION_KEY);
      localStorage.removeItem(SYNCED_SNAPSHOT_KEY);
    }
    localStorage.removeItem(OUTBOX_KEY);
    if (incomingOutbox) {
      const parsedOutbox = JSON.parse(incomingOutbox);
      if (parsedOutbox?.uid === user.uid) localStorage.setItem(OUTBOX_KEY, incomingOutbox);
    }
    status("Switched accounts. Loading this account's saved career…");
    location.reload();
    return true;
  } catch (error) {
    status("Account switch paused because the current career could not be safely separated. No career was intentionally replaced. " + error.message, true);
    return true;
  }
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
      const localMatchesCloud = !!local && sameValue(local.payload, selectedPayload);
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

    // A career already linked to another account is never replaced during
    // sign-in. Authentication identifies the cloud account; it does not grant
    // permission to swap the active local career. Use a separate clean device
    // for a different account, or return to the account that owns this career.
    if (local?.ownerUid && local.ownerUid !== user.uid) {
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData?.schemaVersion === SCHEMA_VERSION && cloudData.payload && typeof cloudData.payload === "object" && !Array.isArray(cloudData.payload)) {
          showConflict(local.raw, cloudData, local.ownerUid);
          status("This device career belongs to a different account. It has not been changed or uploaded. Use a separate browser/device for the signed-in account, or sign back into the account that owns this career.", true);
        } else {
          status("This device's previous account career is preserved. The signed-in account's cloud save format is not recognized; nothing was changed.", true);
        }
      } else {
        status("This device career belongs to another account. It remains untouched and will not be uploaded to this account. Sign back into its original account or use a separate browser/device.", true);
      }
      return;
    }

    const cloud = snap.exists() ? snap.data() : null;
    cloudRevision = Number.isSafeInteger(cloud?.revision) ? cloud.revision : 0;
    if (cloud && (cloud.schemaVersion !== SCHEMA_VERSION || !cloud.payload || typeof cloud.payload !== "object" || Array.isArray(cloud.payload))) {
      status("The cloud save format is not recognized. Nothing was overwritten; ask for help before proceeding.", true);
      return;
    }

    // A device already linked to this account keeps its local career as the
    // active save. The cloud is a backup: only apply remote changes when the
    // confirmed baseline proves this device has not changed since its last sync.
    if (local?.ownerUid === user.uid) {
      if (!cloud) {
        persistDurableOutbox(user.uid, local.payload, "rebuild-missing-cloud-backup");
        await writeCloud(local.payload, user.uid, cloudRevision, { type: "rebuild-missing-cloud-backup" });
        if (!currentUser || currentUser.uid !== user.uid) return;
        clearDurableOutboxIfMatches(user.uid, local.payload);
        syncReady = true;
        status("Cloud backup reconnected from this device's saved career.");
        return;
      }

      const cloudRevisionOnServer = Number.isSafeInteger(cloud.revision) ? cloud.revision : 0;
      const baseline = readSyncedBaseline();
      const localMatchesCloud = sameValue(local.payload, cloud.payload);
      if (localMatchesCloud) {
        localStorage.setItem(LOCAL_REVISION_KEY, String(cloudRevisionOnServer));
        localStorage.setItem(SYNCED_SNAPSHOT_KEY, JSON.stringify(cloud.payload));
        syncReady = true;
        status("Cloud backup connected · this device is ready.");
        return;
      }

      if (baseline) {
        const localMatchesBaseline = sameValue(local.payload, baseline);
        const cloudMatchesBaseline = sameValue(cloud.payload, baseline);
        if (localMatchesBaseline) {
          if (tryApplyNewerCloud(cloud, local)) {
            syncReady = true;
            status("Your latest cloud career is ready to apply at a safe gameplay checkpoint.");
            return;
          }
        } else if (cloudMatchesBaseline) {
          // Only this device changed since the confirmed common snapshot.
          cloudRevision = cloudRevisionOnServer;
          syncReady = true;
          queueSave(local.payload, { checkpointType: "local-first-recovery" });
          status("Your device progress is being backed up automatically.");
          return;
        } else if (tryMergeConcurrentCareer(cloud, local)) {
          syncReady = true;
          return;
        } else {
          showConflict(local.raw, cloud, local.ownerUid);
          status("Both devices changed overlapping career data. Both saves are preserved; choose how to resolve the conflict.", true);
          return;
        }
      } else {
        // Older installations may not have a confirmed baseline. Do not let
        // an unknown cloud timestamp select the active career. Preserve the
        // cloud envelope locally, then back up this already-linked device save
        // using the server's current revision as the compare-and-set baseline.
        localStorage.setItem(`delwin_cloud_backup_unbased_${user.uid}_${Date.now()}`, JSON.stringify(cloud));
        cloudRevision = cloudRevisionOnServer;
        persistDurableOutbox(user.uid, local.payload, "local-first-baseline-recovery");
        await writeCloud(local.payload, user.uid, cloudRevision, { type: "local-first-baseline-recovery" });
        if (!currentUser || currentUser.uid !== user.uid) return;
        clearDurableOutboxIfMatches(user.uid, local.payload);
        syncReady = true;
        status("This device's career remains active. Its previous cloud copy was preserved and the device backup is reconnected.");
        return;
      }

      // If the remote update could not be applied immediately (for example,
      // an active repair is in progress), keep gameplay uninterrupted and
      // defer it to the next safe checkpoint.
      syncReady = true;
      status("Cloud backup connected. Any remote update will wait until gameplay is safe.");
      return;
    }

    // Account creation on a device with an existing guest career: link and back
    // up that career when this account has no cloud save yet.
    if (local && !cloud) {
      // Claim the guest career and persist the backup intent before attempting
      // the first network write. A failed request must survive reload/offline.
      localStorage.setItem(OWNER_KEY, user.uid);
      persistDurableOutbox(user.uid, local.payload, "initial-account-link");
      await writeCloud(local.payload, user.uid);
      if (!currentUser || currentUser.uid !== user.uid) return;
      clearDurableOutboxIfMatches(user.uid, local.payload);
      syncReady = true;
      status("Your existing device career is now backed up to your account.");
      return;
    }

    // Fresh browsers create a starter/tutorial save before Firebase auth finishes.
    // That is not a second career: archive it and restore the existing account save.
    if (local && cloud && isStarterCareer(local.payload)) {
      restoreCloudCareer(local, cloud, user.uid, "starter-save-before-account-restore");
      return;
    }

    // A meaningful unlinked guest career and an existing account career are
    // genuinely different saves. Preserve both and ask only at this boundary.
    if (local && cloud) {
      showConflict(local.raw, cloud);
      status("A guest career and an account career both exist. Both copies are preserved until you choose.", true);
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
      if (syncReady) {
        activateDurableOutbox(user.uid);
        watchCloud(user);
      }
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
    const selectedLocalPayload = JSON.parse(pending.localRaw);
    await writeCloud(selectedLocalPayload, pending.uid, cloudRevision);
    if (!currentUser || currentUser.uid !== pending.uid) return;
    clearDurableOutboxIfMatches(pending.uid, selectedLocalPayload);
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
  const checkpoint = pendingPayload.checkpoint || {};
  pendingPayload = null;
  syncTimer = null;
  let retryDelay = 1400;
  try {
    await writeCloud(next, expectedUid, cloudRevision, checkpoint);
    if (currentUser?.uid === expectedUid) {
      let restoreMarker = null;
      try { restoreMarker = JSON.parse(localStorage.getItem(RESTORE_MARKER_KEY) || "null"); } catch {}
      if (restoreMarker?.uid === expectedUid) localStorage.removeItem(RESTORE_MARKER_KEY);
      clearDurableOutboxIfMatches(expectedUid, next);
      status("Cloud save synced.");
    }
  } catch (error) {
    if (error.code === "save/revision-conflict" && currentUser?.uid === expectedUid) {
      // Stop automatic writes and present both copies. A player must explicitly
      // choose; an older/offline device can never silently replace newer cloud progress.
      syncReady = false;
      let merged = false;
      let conflictShown = false;
      try {
        const latest = await getDoc(doc(db, "users", expectedUid, "saves", "current"));
        if (currentUser?.uid !== expectedUid) return;
        const cloudData = latest.exists() ? latest.data() : null;
        if (cloudData?.payload && typeof cloudData.payload === "object" && !Array.isArray(cloudData.payload)) {
          cloudRevision = Number.isSafeInteger(cloudData.revision) ? cloudData.revision : 0;
          const local = localSnapshot();
          if (local && !local.invalid) {
            merged = tryMergeConcurrentCareer(cloudData, local);
            if (!merged) {
              showConflict(local.raw, cloudData, local.ownerUid);
              conflictShown = true;
            }
          }
        }
      } catch (reconcileError) {
        status("Cloud changed while syncing. Your device save is preserved; reconnect to retry safely.", true);
      }
      if (!merged && !conflictShown) {
        status("A newer cloud career exists. Your device progress is safe; choose which career to keep before syncing again.", true);
      }
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
  const ownerUid = currentUser?.uid || localStorage.getItem(OWNER_KEY);
  if (!ownerUid || (currentUser && localStorage.getItem(OWNER_KEY) !== currentUser.uid)) return;
  const checkpointType = metadata.checkpointType || "gameplay";
  // Persist the upload intent before starting any network work. A reload or
  // offline period must not erase the fact that this local save needs backup.
  persistDurableOutbox(ownerUid, payload, checkpointType);
  if (!currentUser || !syncReady || currentUser.uid !== ownerUid) return;
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
  pendingPayload = { uid: queuedUid, payload: JSON.parse(JSON.stringify(payload)), checkpoint: { type: checkpointType } };
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
window.DelWinCloud = {
  queueSave, keepLocal, onSafeCheckpoint: processDeferredCloudUpdate,
  signOut: () => signOut(auth), hasAccount: () => !!currentUser, isRestorePending,
  reportLocalSaveError(error) {
    const detail = error?.message || "browser storage is unavailable";
    status(`LOCAL SAVE FAILED: ${detail}. Stop making purchases or career changes until storage is available.`, true);
  },
  pendingConflict: null
};
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
  return flushPendingSave(uid);
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
    if (user && switchActiveAccountIfNeeded(user)) return;
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
