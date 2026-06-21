const DB_NAME = "openharness";
const DB_VERSION = 2;

const PROJECTS_STORE = "projects";
const CONVERSATIONS_STORE = "conversations";

export interface StoredProject {
  cwd: string;
  name: string;
  lastActivityAt: string | null;
}

export interface StoredConversation {
  id: string;
  projectCwd: string;
  sessionFile: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: unknown[];
  source?: "github-workflow";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: "cwd" });
      }

      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const store = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
        store.createIndex("projectCwd", "projectCwd", { unique: false });
        store.createIndex("sessionFile", "sessionFile", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });

  return dbPromise;
}

function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (stores: IDBObjectStore[]) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const tx = db.transaction(names, mode);
        const stores = names.map((name) => tx.objectStore(name));
        const request = fn(stores);

        tx.oncomplete = () => {
          if (request && "result" in request) {
            resolve((request as IDBRequest<T>).result);
          } else {
            resolve();
          }
        };
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

export async function getAllProjects(): Promise<StoredProject[]> {
  const rows = await runTransaction<StoredProject[]>(PROJECTS_STORE, "readonly", ([store]) =>
    store.getAll(),
  );
  return (rows as StoredProject[] | void) ?? [];
}

export async function putProject(project: StoredProject): Promise<void> {
  await runTransaction(PROJECTS_STORE, "readwrite", ([store]) => store.put(project));
}

export async function getAllConversations(): Promise<StoredConversation[]> {
  const rows = await runTransaction<StoredConversation[]>(
    CONVERSATIONS_STORE,
    "readonly",
    ([store]) => store.getAll(),
  );
  return (rows as StoredConversation[] | void) ?? [];
}

export async function getConversationsForProject(
  projectCwd: string,
): Promise<StoredConversation[]> {
  const rows = await runTransaction<StoredConversation[]>(
    CONVERSATIONS_STORE,
    "readonly",
    ([store]) => store.index("projectCwd").getAll(projectCwd),
  );
  return (rows as StoredConversation[] | void) ?? [];
}

export async function getConversationById(id: string): Promise<StoredConversation | null> {
  const row = await runTransaction<StoredConversation | undefined>(
    CONVERSATIONS_STORE,
    "readonly",
    ([store]) => store.get(id),
  );
  return (row as StoredConversation | undefined) ?? null;
}

export async function getConversationBySessionFile(
  sessionFile: string,
): Promise<StoredConversation | null> {
  const rows = await runTransaction<StoredConversation[]>(
    CONVERSATIONS_STORE,
    "readonly",
    ([store]) => store.index("sessionFile").getAll(sessionFile),
  );
  const list = (rows as StoredConversation[] | void) ?? [];
  return list[0] ?? null;
}

export async function putConversation(conversation: StoredConversation): Promise<void> {
  await runTransaction(CONVERSATIONS_STORE, "readwrite", ([store]) =>
    store.put(conversation),
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await runTransaction(CONVERSATIONS_STORE, "readwrite", ([store]) => store.delete(id));
}

export async function deleteProject(cwd: string): Promise<void> {
  await runTransaction(PROJECTS_STORE, "readwrite", ([store]) => store.delete(cwd));
}

export async function deleteConversationsForProject(projectCwd: string): Promise<string[]> {
  const conversations = await getConversationsForProject(projectCwd);
  const ids = conversations.map((c) => c.id);
  if (ids.length === 0) return ids;

  await runTransaction(CONVERSATIONS_STORE, "readwrite", ([store]) => {
    for (const id of ids) {
      store.delete(id);
    }
  });
  return ids;
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<boolean> {
  const existing = await getConversationById(id);
  if (!existing) return false;
  existing.title = title;
  await putConversation(existing);
  return true;
}

export async function countConversations(): Promise<number> {
  const rows = await getAllConversations();
  return rows.length;
}
