// Google sign-in. Optional — Life OS works fully signed out, it just won't sync.
// Same Firebase project as the old pushup / workout apps, so the data lines up.

const CONFIG = {
  apiKey: 'AIzaSyAyT3wRMvkB_J6DPDH234BLRYJI8n8s3hg',
  authDomain: 'workouttracker-17830.firebaseapp.com',
  projectId: 'workouttracker-17830',
  storageBucket: 'workouttracker-17830.firebasestorage.app',
  messagingSenderId: '792113873446',
  appId: '1:792113873446:web:1cc623862b04d130addce7'
};

export const PROJECT_ID = CONFIG.projectId;

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

let auth = null;
let user = null;
let ready = false;
const listeners = new Set();

function emit() { listeners.forEach(fn => fn(user)); }

// Loads the Firebase SDK from the CDN. If we're offline this throws, and the app
// carries on in local-only mode — that's deliberate, not an error to shout about.
async function load() {
  const [{ initializeApp }, authMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`)
  ]);
  const app = initializeApp(CONFIG);
  auth = authMod.getAuth(app);
  auth.useDeviceLanguage();
  return authMod;
}

let authMod = null;

export async function initAuth(onUser) {
  if (onUser) listeners.add(onUser);
  if (ready) { onUser && onUser(user); return; }
  try {
    authMod = await load();
    authMod.onAuthStateChanged(auth, u => { user = u; ready = true; emit(); });
    // Catches the redirect flow used when a popup is blocked (iOS sometimes does this).
    authMod.getRedirectResult(auth).catch(() => {});
  } catch (err) {
    ready = true;
    emit();
    console.warn('[auth] SDK unavailable, staying local-only:', err.message);
  }
}

export async function signIn() {
  if (!authMod) authMod = await load();
  const provider = new authMod.GoogleAuthProvider();
  try {
    await authMod.signInWithPopup(auth, provider);
  } catch (err) {
    // Popups get blocked inside installed PWAs on iOS — fall back to a redirect.
    if (String(err.code).includes('popup')) return authMod.signInWithRedirect(auth, provider);
    throw err;
  }
}

export async function signOutNow() {
  if (authMod && auth) await authMod.signOut(auth);
}

export function currentUser() { return user; }
export function uid() { return user ? user.uid : null; }

// Firestore REST calls need a fresh ID token; the SDK refreshes it for us.
export async function idToken() {
  return user ? user.getIdToken() : null;
}
