const DB_NAME = "openharness";
const DB_VERSION = 6;

const PROJECTS_STORE = "projects";
const CONVERSATIONS_STORE = "conversations";
const WORKFLOW_RUNS_STORE = "workflow_runs";

export type ConversationContext = "coding" | "work" | "work-project";

export type ProjectSidebarMode = "coding" | "work";

export type StoredAttachedRoot = {
  id: string;
  absolutePath: string;
  kind: "file" | "folder";
  label: string;
};

export type StoredWorkbookTabsState = {
  openPaths: string[];
  activePath?: string;
  activeSheetByPath?: Record<string, string>;
};

export interface StoredProject {
  cwd: string;
  name: string;
  lastActivityAt: string | null;
  /** Which sidebar owns this folder. Defaults to coding for legacy rows. */
  sidebarMode?: ProjectSidebarMode;
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
  /** When "work", thread appears in everyday work mode only. */
  context?: ConversationContext;
  /** Open spreadsheet tabs for work-mode threads. */
  workbookTabs?: StoredWorkbookTabsState;
  /** External file/folder grants for work-mode threads. */
  attachedRoots?: StoredAttachedRoot[];
}

export interface StoredWorkflowRun {
  runId: string;
  workflowId: string | null;
  title: string;
  messages: unknown[];
  streaming: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
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

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: "cwd" });
      }

      let conversationsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        conversationsStore = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
        conversationsStore.createIndex("projectCwd", "projectCwd", { unique: false });
        conversationsStore.createIndex("sessionFile", "sessionFile", { unique: false });
        conversationsStore.createIndex("updatedAt", "updatedAt", { unique: false });
      } else {
        conversationsStore = request.transaction!.objectStore(CONVERSATIONS_STORE);
      }

      if (oldVersion < 3 && !conversationsStore.indexNames.contains("context")) {
        conversationsStore.createIndex("context", "context", { unique: false });
      }

      if (!db.objectStoreNames.contains(WORKFLOW_RUNS_STORE)) {
        const workflowRunsStore = db.createObjectStore(WORKFLOW_RUNS_STORE, { keyPath: "runId" });
        workflowRunsStore.createIndex("updatedAt", "updatedAt", { unique: false });
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
  const list = (rows as StoredConversation[] | void) ?? [];
  return list.filter(
    (row) =>
      row.context !== "work" &&
      row.context !== "work-project" &&
      row.source !== "github-workflow",
  );
}

export async function getWorkProjectConversations(
  projectCwd: string,
): Promise<StoredConversation[]> {
  const rows = await runTransaction<StoredConversation[]>(
    CONVERSATIONS_STORE,
    "readonly",
    ([store]) => store.index("projectCwd").getAll(projectCwd),
  );
  const list = (rows as StoredConversation[] | void) ?? [];
  return list.filter(
    (row) => row.context === "work-project" && row.source !== "github-workflow",
  );
}

export async function getWorkConversations(): Promise<StoredConversation[]> {
  const rows = await getAllConversations();
  return rows.filter((row) => row.context === "work");
}

export async function getWorkSidebarProjects(): Promise<StoredProject[]> {
  const projects = await getAllProjects();
  return projects.filter(
    (project) => project.sidebarMode === "work" && project.cwd.length > 0,
  );
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

export async function updateConversationWorkbookTabs(
  id: string,
  workbookTabs: StoredWorkbookTabsState | undefined,
): Promise<boolean> {
  const existing = await getConversationById(id);
  if (!existing) return false;
  if (workbookTabs && workbookTabs.openPaths.length > 0) {
    existing.workbookTabs = workbookTabs;
  } else {
    delete existing.workbookTabs;
  }
  await putConversation(existing);
  return true;
}

export async function updateConversationAttachedRoots(
  id: string,
  attachedRoots: StoredAttachedRoot[] | undefined,
): Promise<boolean> {
  const existing = await getConversationById(id);
  if (!existing) return false;
  if (attachedRoots && attachedRoots.length > 0) {
    existing.attachedRoots = attachedRoots;
  } else {
    delete existing.attachedRoots;
  }
  await putConversation(existing);
  return true;
}

export async function countConversations(): Promise<number> {
  const rows = await getAllConversations();
  return rows.length;
}

export async function getWorkflowRunById(runId: string): Promise<StoredWorkflowRun | null> {
  const row = await runTransaction<StoredWorkflowRun | undefined>(
    WORKFLOW_RUNS_STORE,
    "readonly",
    ([store]) => store.get(runId),
  );
  return (row as StoredWorkflowRun | undefined) ?? null;
}

export async function putWorkflowRun(run: StoredWorkflowRun): Promise<void> {
  await runTransaction(WORKFLOW_RUNS_STORE, "readwrite", ([store]) => store.put(run));
}

export async function getAllWorkflowRuns(): Promise<StoredWorkflowRun[]> {
  const rows = await runTransaction<StoredWorkflowRun[]>(
    WORKFLOW_RUNS_STORE,
    "readonly",
    ([store]) => store.getAll(),
  );
  return (rows as StoredWorkflowRun[] | void) ?? [];
}
