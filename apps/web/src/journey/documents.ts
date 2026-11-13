export type StoredDocument = { id: string; sha256: string; bytes: Uint8Array; createdAt: string };
const sessionDocuments = new Map<string, StoredDocument>();
function openDocuments(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open("hansung-ieum-documents-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function clearDocuments() {
  if (globalThis.indexedDB) {
    const db = await openDocuments();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  sessionDocuments.clear();
}
export async function documentHash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
export async function readDocument(id: string): Promise<StoredDocument | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDocuments();
    const opened = db;
    return await new Promise((resolve, reject) => {
      const request = opened.transaction("documents").objectStore("documents").get(id);
      request.onsuccess = () => resolve(request.result ?? sessionDocuments.get(id) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return sessionDocuments.get(id) ?? null;
  } finally {
    db?.close();
  }
}
export async function archiveDocument(
  id: string,
  bytes: Uint8Array,
): Promise<{ document: StoredDocument; storage: "DEVICE" | "SESSION" }> {
  const sha256 = await documentHash(bytes);
  const previous = await readDocument(id);
  if (previous && previous.sha256 !== sha256)
    throw new Error("이미 보관된 문서 버전은 덮어쓸 수 없어요.");
  const document = previous ?? {
    id,
    sha256,
    bytes: bytes.slice(),
    createdAt: new Date().toISOString(),
  };
  let db: IDBDatabase | undefined;
  try {
    db = await openDocuments();
    const opened = db;
    await new Promise<void>((resolve, reject) => {
      const tx = opened.transaction("documents", "readwrite");
      const store = tx.objectStore("documents");
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) store.add(document);
        else if (request.result.sha256 !== sha256) tx.abort();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new DOMException("Document revision conflict", "ConstraintError"));
    });
    return { document, storage: "DEVICE" };
  } catch (error) {
    if (error instanceof DOMException && ["ConstraintError", "AbortError"].includes(error.name))
      throw error;
    sessionDocuments.set(id, document);
    return { document, storage: "SESSION" };
  } finally {
    db?.close();
  }
}
