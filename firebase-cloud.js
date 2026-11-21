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
const SCHEMA_VERSION = 1;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let syncReady = false;
let syncTimer = null;
let pendingPayload = null;
let busy = false;

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
    await runAuth(() => createUserWithEmailAndPassword(auth, email, password), "Creating account…");
  });
  signin?.addEventListener("click", async () => {
    const { email, password } = credentials();
    if (!email || !password) return status("Enter your email and password.", true);
    await runAuth(() => signInWithEmailAndPassword(auth, email, password), "Signing in…");
  });
  reset?.addEventListener("click", async () => {
    const { email } = credentials();
    if (!email) return status("Enter your email first, then choose Forgot password.", true);
    await runAuth(() => sendPasswordResetEmail(auth, email), "Sending password-reset email…", "Password-reset email sent. Check your inbox.");
  });
  signout?.addEventListener("click", async () => {
    await runAuth(() => signOut(auth), "Signing out…", "Signed out. This device's local career is still saved.");
  });
}
function credentials() {
  return {
    email: document.getElementById("cloud-email")?.value.trim() || "",
    password: document.getElementById("cloud-password")?.value || ""
  };
}
async function runAuth(action, pendingMessage, successMessage) {
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
      "auth/network-request-failed": "Network error. Check your connection and try again."
    };
    status(messages[error.code] || error.message || "Account request failed.", true);
  }
}
function localSnapshot() {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { raw, payload: parsed } : null;
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
function showConflict(localRaw, cloudData) {
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
    <button class="primary-btn" onclick="window.DelWinCloud.keepLocal()">KEEP THIS DEVICE'S CAREER</button>
    <button class="secondary-btn" onclick="window.DelWinCloud.keepCloud()">RESTORE CLOUD CAREER</button>
    <p style="font-size:10px;color:var(--muted);">The copy you do not choose will be backed up on this device before anything is replaced.</p>
  `);
  window.DelWinCloud.pendingConflict = { localRaw, cloudData };
}
async function writeCloud(payload) {
  if (!currentUser) throw new Error("Sign in before syncing.");
  const ref = doc(db, "users", currentUser.uid, "saves", "current");
  await setDoc(ref, saveEnvelope(payload));
}
async function reconcile(user) {
  syncReady = false;
  busy = true;
  status("Checking for an existing cloud career…");
  try {
    const ref = doc(db, "users", user.uid, "saves", "current");
    const snap = await getDoc(ref);
    const local = localSnapshot();
    if (local?.invalid) return;
    if (!snap.exists()) {
      if (local) {
        await writeCloud(local.payload);
        status("Your existing device career is backed up to your account.");
      } else {
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
      status("Cloud career restored to this device.");
      location.reload();
      return;
    }
    if (JSON.stringify(local.payload) === JSON.stringify(cloud.payload)) {
      syncReady = true;
      status("Account connected · local and cloud careers match.");
      return;
    }
    showConflict(local.raw, cloud);
  } catch (error) {
    status(`Cloud check failed: ${error.message}. Your local career remains available.`, true);
  } finally {
    busy = false;
  }
}
async function keepLocal() {
  const pending = window.DelWinCloud.pendingConflict;
  if (!pending || !currentUser) return;
  try {
    localStorage.setItem(`delwin_cloud_backup_${currentUser.uid}`, JSON.stringify(pending.cloudData));
    await writeCloud(JSON.parse(pending.localRaw));
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
  if (!pending) return;
  try {
    backupLocal(pending.localRaw);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(pending.cloudData.payload));
    window.DelWinCloud.pendingConflict = null;
    syncReady = true;
    window.closeModal?.();
    location.reload();
  } catch (error) {
    status(`Could not restore cloud career: ${error.message}`, true);
  }
}
function queueSave(payload) {
  if (!currentUser || !syncReady || busy || !navigator.onLine) return;
  pendingPayload = JSON.parse(JSON.stringify(payload));
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (!currentUser || !syncReady || !pendingPayload) return;
    const next = pendingPayload;
    pendingPayload = null;
    try {
      await writeCloud(next);
      status("Cloud save synced.");
    } catch (error) {
      status(`Cloud sync paused: ${error.message}. Your local career is safe.`, true);
    }
  }, 1400);
}
window.DelWinCloud = { queueSave, keepLocal, keepCloud, signOut: () => signOut(auth), hasAccount: () => !!currentUser, pendingConflict: null };
window.addEventListener("online", () => {
  if (currentUser) reconcile(currentUser);
});
accountCard();
onAuthStateChanged(auth, user => {
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
