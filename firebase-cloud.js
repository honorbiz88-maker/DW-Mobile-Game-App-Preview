import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyATtykiRuuWd1bUOg80NYfqPCcgZqVVCYs",
  authDomain: "delwin-mobile-game.firebaseapp.com",
  projectId: "delwin-mobile-game",
  storageBucket: "delwin-mobile-game.firebasestorage.app",
  messagingSenderId: "211403769437",
  appId: "1:211403769437:web:097454c8d49caf91ab2fb4"
};

const LOCAL_KEY = "delwin_v4_save";
const OWNER_KEY = "delwin_cloud_owner_uid";
const SCHEMA_VERSION = 1;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let syncReady = false;
let syncTimer = null;
let pendingPayload = null;
let busy = false;
let writing = false;

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
function saveEnvelope(payload) {
  return {
    schemaVersion: SCHEMA_VERSION,
    payload,
    updatedAt: serverTimestamp(),
    deviceId: getDeviceId()
  };
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
async function writeCloud(payload, expectedUid = currentUser?.uid) {
  if (!expectedUid || !currentUser || currentUser.uid !== expectedUid) {
    throw new Error("Account changed before the save could sync. Your local career is safe.");
  }
  const ref = doc(db, "users", expectedUid, "saves", "current");
  await setDoc(ref, saveEnvelope(payload));
}
async function reconcile(user) {
  syncReady = false;
  busy = true;
  status("Checking for an existing cloud career…");
  try {
    const ref = doc(db, "users", user.uid, "saves", "current");
    const snap = await getDoc(ref);
    // Authentication may have changed while Firestore was responding. A stale
    // reconciliation must never restore one account's save over another's local career.
    if (!currentUser || currentUser.uid !== user.uid) return;
    const local = localSnapshot();
    if (local?.invalid) return;
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
    if (!snap.exists()) {
      if (local?.ownerUid && local.ownerUid !== user.uid) {
        status("This device's career is linked to another account. Nothing was uploaded. Sign back into that account or restore it from a cloud backup.", true);
        return;
      }
      if (local) {
        await writeCloud(local.payload, user.uid);
        if (!currentUser || currentUser.uid !== user.uid) return;
        localStorage.setItem(OWNER_KEY, user.uid);
        status("Your existing device career is backed up to your account.");
      } else {
        localStorage.setItem(OWNER_KEY, user.uid);
        status("Account connected. Your career will sync after your first save.");
      }
      syncReady = true;
      return;
    }
    const cloud = snap.data();
    if (!cloud || cloud.schemaVersion !== SCHEMA_VERSION || !cloud.payload || typeof cloud.payload !== "object" || Array.isArray(cloud.payload)) {
      status("The cloud save format is not recognized. Nothing was overwritten; ask for help before proceeding.", true);
      return;
    }
    if (!local) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(cloud.payload));
      localStorage.setItem(OWNER_KEY, user.uid);
      status("Cloud career restored to this device.");
      location.reload();
      return;
    }
    if (JSON.stringify(local.payload) === JSON.stringify(cloud.payload)) {
      localStorage.setItem(OWNER_KEY, user.uid);
      syncReady = true;
      status("Account connected · local and cloud careers match.");
      return;
    }
    showConflict(local.raw, cloud);
  } catch (error) {
    status(`Cloud check failed: ${error.message}. Your local career remains available.`, true);
  } finally {
    if (currentUser?.uid === user.uid) busy = false;
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
    await writeCloud(JSON.parse(pending.localRaw), pending.uid);
    if (!currentUser || currentUser.uid !== pending.uid) return;
    localStorage.setItem(OWNER_KEY, pending.uid);
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
    localStorage.setItem(LOCAL_KEY, JSON.stringify(pending.cloudData.payload));
    localStorage.setItem(OWNER_KEY, currentUser.uid);
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
  if (!pendingBelongsToUser(pendingPayload, currentUser) || currentUser.uid !== expectedUid || !syncReady) return;
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
    await writeCloud(next, expectedUid);
    if (currentUser?.uid === expectedUid) status("Cloud save synced.");
  } catch (error) {
    if (currentUser?.uid === expectedUid && syncReady) {
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
    if (currentUser && syncReady && pendingBelongsToUser(pendingPayload, currentUser)) {
      clearTimeout(syncTimer);
      const nextUid = currentUser.uid;
      syncTimer = setTimeout(() => flushPendingSave(nextUid), retryDelay);
    }
  }
}
function queueSave(payload) {
  if (!currentUser || !syncReady || !navigator.onLine) return;
  if (localStorage.getItem(OWNER_KEY) !== currentUser.uid) {
    status("Cloud sync paused: this device's career belongs to a different account.", true);
    return;
  }
  const queuedUid = currentUser.uid;
  pendingPayload = { uid: queuedUid, payload: JSON.parse(JSON.stringify(payload)) };
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => flushPendingSave(queuedUid), 1400);
}
window.DelWinCloud = { queueSave, keepLocal, keepCloud, signOut: () => signOut(auth), hasAccount: () => !!currentUser, pendingConflict: null };
window.addEventListener("online", () => {
  if (currentUser) reconcile(currentUser);
});
accountCard();

onAuthStateChanged(auth, user => {
    const previousUid = currentUser?.uid || null;
    const nextUid = user?.uid || null;
    if (previousUid !== nextUid) {
      clearTimeout(syncTimer);
      syncTimer = null;
      pendingPayload = null;
      window.DelWinCloud && (window.DelWinCloud.pendingConflict = null);
      busy = false;
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
