/**
 * Mock de Firebase Auth para DEMO MODE.
 *
 * El supervisor entra como "anónimo" automáticamente.
 * El admin entra con cualquier email/contraseña y queda registrado en
 * /admins/<uid> de la Firestore mock (ver seed.ts), así el AppContext lo
 * reconoce como administrador.
 */

const ANON_USER = makeUser({
  uid: "demo-supervisor",
  email: null,
  isAnonymous: true,
  displayName: "Supervisor (demo)",
});

let currentUser: any = ANON_USER;
const listeners = new Set<(u: any) => void>();

function makeUser(opts: {
  uid: string;
  email?: string | null;
  isAnonymous?: boolean;
  displayName?: string;
}) {
  const u = {
    uid: opts.uid,
    email: opts.email ?? null,
    displayName: opts.displayName || "",
    isAnonymous: opts.isAnonymous ?? false,
    emailVerified: !opts.isAnonymous,
    photoURL: null as string | null,
    phoneNumber: null as string | null,
    providerId: opts.isAnonymous ? "anonymous" : "password",
    getIdToken: async () => `demo-id-token-${opts.uid}`,
    getIdTokenResult: async () => ({
      token: `demo-id-token-${opts.uid}`,
      claims: {},
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 3600_000).toISOString(),
      signInProvider: opts.isAnonymous ? "anonymous" : "password",
      signInSecondFactor: null,
    }),
    delete: async () => {},
    reload: async () => {},
    toJSON: () => ({ ...u }),
  };
  return u;
}

function notify() {
  listeners.forEach((cb) => {
    try {
      cb(currentUser);
    } catch (err) {
      console.error("[demo-auth] listener error:", err);
    }
  });
}

export function getAuth(_app?: any) {
  return {
    get currentUser() {
      return currentUser;
    },
    set currentUser(u: any) {
      currentUser = u;
      notify();
    },
    languageCode: "es",
    tenantId: null as string | null,
    settings: {},
    signOut: async () => {
      currentUser = ANON_USER;
      notify();
    },
    onAuthStateChanged: (cb: (u: any) => void) => {
      listeners.add(cb);
      queueMicrotask(() => cb(currentUser));
      return () => listeners.delete(cb);
    },
  };
}

export function onAuthStateChanged(_auth: any, cb: (u: any) => void) {
  listeners.add(cb);
  queueMicrotask(() => cb(currentUser));
  return () => listeners.delete(cb);
}

export function onIdTokenChanged(_auth: any, cb: (u: any) => void) {
  return onAuthStateChanged(_auth, cb);
}

export async function signInAnonymously(_auth: any) {
  currentUser = ANON_USER;
  notify();
  return { user: currentUser, providerId: "anonymous", operationType: "signIn" };
}

export async function signInWithEmailAndPassword(
  _auth: any,
  email: string,
  password: string
) {
  if (!email || !password) {
    const err: any = new Error("Email o contraseña vacíos");
    err.code = "auth/invalid-credential";
    throw err;
  }
  currentUser = makeUser({
    uid: "demo-admin",
    email,
    isAnonymous: false,
    displayName: "Administrador (demo)",
  });
  notify();
  return { user: currentUser, providerId: "password", operationType: "signIn" };
}

export async function createUserWithEmailAndPassword(
  _auth: any,
  email: string,
  _password: string
) {
  return signInWithEmailAndPassword(_auth, email, _password);
}

export async function signInWithPopup(_auth: any, _provider: any) {
  // Para Drive/Calendar real necesitas OAuth.  En demo solo simulamos.
  return {
    user: makeUser({
      uid: "demo-google",
      email: "demo@google.com",
      isAnonymous: false,
      displayName: "Usuario Google (demo)",
    }),
    providerId: "google.com",
    operationType: "signIn",
  };
}

export async function signOut(_auth: any) {
  currentUser = ANON_USER;
  notify();
}

// Provider stubs
export class GoogleAuthProvider {
  static PROVIDER_ID = "google.com";
  static credential(_idToken: string | null, _accessToken?: string | null) {
    return { providerId: "google.com", signInMethod: "google.com" };
  }
  static credentialFromResult(_r: any) {
    return null;
  }
  static credentialFromError(_e: any) {
    return null;
  }
  addScope(_s: string) {
    return this;
  }
  setCustomParameters(_p: any) {
    return this;
  }
  providerId = "google.com";
}

export class EmailAuthProvider {
  static PROVIDER_ID = "password";
  providerId = "password";
}

export type User = ReturnType<typeof makeUser>;
