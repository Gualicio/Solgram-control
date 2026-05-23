/**
 * In-memory Firestore mock used in DEMO MODE.
 *
 * Implementa la API que usa el resto del código (collection, doc, addDoc,
 * setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, limit,
 * writeBatch).  Los documentos viven en una Map en memoria y se persisten
 * en localStorage, así los cambios sobreviven a recargas del navegador.
 *
 * Vite reescribe `firebase/firestore` -> este archivo cuando se compila
 * con VITE_DEMO_MODE=true (ver vite.config.ts).
 */

import { seedDemoStore } from "./seed";

const STORAGE_KEY = "solgram-demo-firestore-v1";
const SEEDED_FLAG = "solgram-demo-firestore-seeded-v1";

type DocData = Record<string, any>;

// path completo (ej. "reports/abc123") -> data
const store = new Map<string, DocData>();

// listeners por path de documento
const docListeners = new Map<string, Set<(data: DocData | null) => void>>();
// listeners por path de colección (ej. "reports")
const collListeners = new Map<string, Set<(items: Array<{ id: string; data: DocData }>) => void>>();

// ---------------------------------------------------------------------------
// Persistencia en localStorage
// ---------------------------------------------------------------------------
function loadFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([k, v]) => store.set(k, v as DocData));
      return true;
    }
  } catch {}
  return false;
}

function saveToStorage(): void {
  try {
    const obj: Record<string, DocData> = {};
    store.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (err) {
    console.warn("[demo-firestore] could not persist:", err);
  }
}

function ensureInitialized(): void {
  if ((globalThis as any).__solgramDemoStoreInit) return;
  (globalThis as any).__solgramDemoStoreInit = true;
  loadFromStorage();
  if (!localStorage.getItem(SEEDED_FLAG)) {
    seedDemoStore({
      put: (path: string, data: DocData) => store.set(path, data),
    });
    localStorage.setItem(SEEDED_FLAG, "1");
    saveToStorage();
  }
}

// ---------------------------------------------------------------------------
// Refs
// ---------------------------------------------------------------------------
interface DocRefMock {
  __ref: "doc";
  path: string;
  id: string;
}
interface CollRefMock {
  __ref: "col";
  path: string;
  id: string;
}
interface QueryMock {
  __ref: "query";
  coll: CollRefMock;
}

function isDocRef(x: any): x is DocRefMock {
  return x && x.__ref === "doc";
}
function isCollRef(x: any): x is CollRefMock {
  return x && x.__ref === "col";
}
function isQuery(x: any): x is QueryMock {
  return x && x.__ref === "query";
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Notificaciones a listeners
// ---------------------------------------------------------------------------
function notifyDoc(path: string): void {
  const set = docListeners.get(path);
  if (set) {
    const data = store.get(path) || null;
    set.forEach((cb) => cb(data));
  }
  // re-emite al listener de la colección padre
  const parts = path.split("/");
  if (parts.length >= 2) {
    parts.pop();
    const collPath = parts.join("/");
    notifyColl(collPath);
  }
}

function listCollDocs(collPath: string): Array<{ id: string; data: DocData }> {
  const items: Array<{ id: string; data: DocData }> = [];
  store.forEach((data, p) => {
    if (p.startsWith(collPath + "/")) {
      const rel = p.slice(collPath.length + 1);
      if (!rel.includes("/")) items.push({ id: rel, data });
    }
  });
  return items;
}

function notifyColl(collPath: string): void {
  const set = collListeners.get(collPath);
  if (set) {
    const items = listCollDocs(collPath);
    set.forEach((cb) => cb(items));
  }
}

// ---------------------------------------------------------------------------
// API pública (matching firebase/firestore)
// ---------------------------------------------------------------------------
export function initializeFirestore(_app: any, _settings?: any, _dbId?: any): any {
  ensureInitialized();
  return { __mockDb: true };
}
export function getFirestore(_app?: any): any {
  ensureInitialized();
  return { __mockDb: true };
}

export function collection(_dbOrDoc: any, ...path: string[]): CollRefMock {
  let basePath = "";
  if (isDocRef(_dbOrDoc)) basePath = _dbOrDoc.path + "/";
  const fullPath = basePath + path.join("/");
  return { __ref: "col", path: fullPath, id: path[path.length - 1] || "" };
}

export function doc(dbOrRef: any, ...path: string[]): DocRefMock {
  if (isCollRef(dbOrRef)) {
    if (path.length === 0) {
      const id = generateId();
      return { __ref: "doc", path: `${dbOrRef.path}/${id}`, id };
    }
    const id = path[path.length - 1];
    return { __ref: "doc", path: `${dbOrRef.path}/${path.join("/")}`, id };
  }
  // dbOrRef es la "db"
  const fullPath = path.join("/");
  const id = path[path.length - 1];
  return { __ref: "doc", path: fullPath, id };
}

export async function setDoc(
  ref: DocRefMock,
  data: DocData,
  options?: { merge?: boolean }
): Promise<void> {
  ensureInitialized();
  if (options?.merge) {
    const existing = store.get(ref.path) || {};
    store.set(ref.path, { ...existing, ...data });
  } else {
    store.set(ref.path, { ...data });
  }
  saveToStorage();
  notifyDoc(ref.path);
}

export async function addDoc(coll: CollRefMock, data: DocData): Promise<DocRefMock> {
  ensureInitialized();
  const id = generateId();
  const path = `${coll.path}/${id}`;
  store.set(path, { ...data });
  saveToStorage();
  notifyDoc(path);
  return { __ref: "doc", path, id };
}

export async function updateDoc(ref: DocRefMock, data: Partial<DocData>): Promise<void> {
  ensureInitialized();
  const existing = store.get(ref.path);
  if (!existing) {
    // Firebase real lanza error si el doc no existe; aquí lo creamos.
    store.set(ref.path, { ...data });
  } else {
    store.set(ref.path, { ...existing, ...data });
  }
  saveToStorage();
  notifyDoc(ref.path);
}

export async function deleteDoc(ref: DocRefMock): Promise<void> {
  ensureInitialized();
  store.delete(ref.path);
  saveToStorage();
  notifyDoc(ref.path);
}

function buildDocSnap(path: string, id: string) {
  const data = store.get(path);
  return {
    exists: () => data !== undefined,
    data: () => data,
    id,
    ref: { __ref: "doc", path, id } as DocRefMock,
  };
}

export async function getDoc(ref: DocRefMock) {
  ensureInitialized();
  return buildDocSnap(ref.path, ref.id);
}

export async function getDocFromServer(ref: DocRefMock) {
  return getDoc(ref);
}

function buildQuerySnap(items: Array<{ id: string; data: DocData; collPath: string }>) {
  const docs = items.map((it) => ({
    id: it.id,
    data: () => it.data,
    ref: { __ref: "doc", path: `${it.collPath}/${it.id}`, id: it.id } as DocRefMock,
  }));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (fn: (d: any) => void) => docs.forEach(fn),
  };
}

export async function getDocs(qOrColl: any) {
  ensureInitialized();
  const coll: CollRefMock = isCollRef(qOrColl) ? qOrColl : qOrColl.coll;
  const items = listCollDocs(coll.path).map((it) => ({ ...it, collPath: coll.path }));
  return buildQuerySnap(items);
}

export function query(coll: CollRefMock, ..._constraints: any[]): QueryMock {
  return { __ref: "query", coll };
}
export function where(_field: string, _op: string, _value: any): any {
  return { __constraint: "where" };
}
export function orderBy(_field: string, _dir?: string): any {
  return { __constraint: "orderBy" };
}
export function limit(_n: number): any {
  return { __constraint: "limit" };
}
export function startAfter(..._args: any[]): any {
  return { __constraint: "startAfter" };
}

export function onSnapshot(refOrQuery: any, ...args: Function[]): () => void {
  ensureInitialized();
  // Soporta firmas: (ref, next) | (ref, next, error) | (ref, options, next, error)
  let next: Function | undefined;
  for (const a of args) {
    if (typeof a === "function") {
      next = a;
      break;
    }
  }
  if (!next) return () => {};

  if (isDocRef(refOrQuery)) {
    const ref = refOrQuery;
    const set = docListeners.get(ref.path) || new Set();
    const cb = (_data: DocData | null) => next!(buildDocSnap(ref.path, ref.id));
    set.add(cb);
    docListeners.set(ref.path, set);
    queueMicrotask(() => cb(store.get(ref.path) || null));
    return () => {
      const s = docListeners.get(ref.path);
      if (s) s.delete(cb);
    };
  }

  const coll: CollRefMock = isQuery(refOrQuery) ? refOrQuery.coll : refOrQuery;
  const set = collListeners.get(coll.path) || new Set();
  const cb = (items: Array<{ id: string; data: DocData }>) => {
    next!(buildQuerySnap(items.map((it) => ({ ...it, collPath: coll.path }))));
  };
  set.add(cb);
  collListeners.set(coll.path, set);
  queueMicrotask(() => cb(listCollDocs(coll.path)));
  return () => {
    const s = collListeners.get(coll.path);
    if (s) s.delete(cb);
  };
}

export function writeBatch(_db: any) {
  const ops: Array<() => void> = [];
  const affectedDocs = new Set<string>();
  return {
    set(ref: DocRefMock, data: DocData, options?: { merge?: boolean }) {
      ops.push(() => {
        if (options?.merge) {
          const existing = store.get(ref.path) || {};
          store.set(ref.path, { ...existing, ...data });
        } else {
          store.set(ref.path, { ...data });
        }
        affectedDocs.add(ref.path);
      });
      return this;
    },
    update(ref: DocRefMock, data: Partial<DocData>) {
      ops.push(() => {
        const existing = store.get(ref.path) || {};
        store.set(ref.path, { ...existing, ...data });
        affectedDocs.add(ref.path);
      });
      return this;
    },
    delete(ref: DocRefMock) {
      ops.push(() => {
        store.delete(ref.path);
        affectedDocs.add(ref.path);
      });
      return this;
    },
    async commit() {
      ops.forEach((fn) => fn());
      saveToStorage();
      affectedDocs.forEach((p) => notifyDoc(p));
    },
  };
}

// Stubs para cosas que el código pueda importar pero no use a fondo en demo.
export const Timestamp = {
  now: () => ({
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  }),
  fromDate: (d: Date) => ({
    toDate: () => d,
    toMillis: () => d.getTime(),
    seconds: Math.floor(d.getTime() / 1000),
    nanoseconds: 0,
  }),
};

export const serverTimestamp = () => new Date().toISOString();
export const arrayUnion = (...items: any[]) => ({ __op: "arrayUnion", items });
export const arrayRemove = (...items: any[]) => ({ __op: "arrayRemove", items });
export const increment = (n: number) => ({ __op: "increment", n });
export const deleteField = () => ({ __op: "deleteField" });

// Firebase real exporta enableIndexedDbPersistence/etc.; los hacemos no-op.
export const enableIndexedDbPersistence = async () => {};
export const enableMultiTabIndexedDbPersistence = async () => {};
