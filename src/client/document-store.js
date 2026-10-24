export const DOCUMENTS_STORAGE_KEY = 'dsh-moss-workbench-docs-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const id = () => globalThis.crypto?.randomUUID?.() || `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function documentTitle(state) {
  return String(state.globalNoteZh || state.globalCaption || state.items?.find(item => item.noteZh)?.noteZh || `画布_${state.canvasWidth}x${state.canvasHeight}`).trim().slice(0, 60);
}
export function documentFingerprint(state) {
  const value = JSON.stringify(state);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return `${value.length}:${a >>> 0}:${b >>> 0}`;
}
function makeDocument(state, title = documentTitle(state), manualTitle = false) {
  return { id: id(), title, manualTitle, state: copy(state), savedFingerprint: documentFingerprint(state), savedAt: Date.now(), updatedAt: Date.now() };
}
export function createDocumentStore(state, persisted) {
  if (persisted?.version === 1 && Array.isArray(persisted.documents)) {
    const seen = new Set();
    const documents = persisted.documents.filter(doc => {
      if (!doc?.id || seen.has(doc.id) || !Array.isArray(doc.state?.items) || !Array.isArray(doc.state?.strokes) || !(doc.state.canvasWidth > 0 && doc.state.canvasHeight > 0)) return false;
      seen.add(doc.id); return true;
    }).map(doc => ({ ...doc, title: String(doc.title || documentTitle(doc.state)).slice(0, 60) }));
    if (documents.length) return { version: 1, activeId: documents.some(doc => doc.id === persisted.activeId) ? persisted.activeId : documents[0].id, documents };
  }
  const doc = makeDocument(state);
  return { version: 1, activeId: doc.id, documents: [doc] };
}
export function updateActiveDocument(store, state) {
  return { ...store, documents: store.documents.map(doc => doc.id === store.activeId ? { ...doc, state: copy(state), updatedAt: Date.now(), title: doc.manualTitle ? doc.title : (state.globalNoteZh?.trim() || state.globalCaption?.trim() || state.items?.some(item => item.noteZh?.trim())) ? documentTitle(state) : doc.title } : doc) };
}
export function saveActiveDocument(store, state) {
  const next = updateActiveDocument(store, state);
  return { ...next, documents: next.documents.map(doc => doc.id === next.activeId ? { ...doc, savedFingerprint: documentFingerprint(state), savedAt: Date.now() } : doc) };
}
export function newDocument(store, current, blank) {
  const next = saveActiveDocument(store, current);
  let n = next.documents.length + 1;
  while (next.documents.some(doc => doc.title === `未命名-${n}`)) n++;
  const doc = makeDocument(blank, `未命名-${n}`);
  return { ...next, activeId: doc.id, documents: [...next.documents, doc] };
}
export function switchDocument(store, current, targetId) {
  if (!store.documents.some(doc => doc.id === targetId)) return store;
  return { ...updateActiveDocument(store, current), activeId: targetId };
}
export function closeDocument(store, current, targetId, blank) {
  const next = updateActiveDocument(store, current), index = next.documents.findIndex(doc => doc.id === targetId);
  if (index < 0) return store;
  const documents = next.documents.filter(doc => doc.id !== targetId);
  if (!documents.length) { const doc = makeDocument(blank, '未命名-1'); return { ...next, activeId: doc.id, documents: [doc] }; }
  return { ...next, activeId: targetId === next.activeId ? documents[Math.min(index, documents.length - 1)].id : next.activeId, documents };
}
export function renameDocument(store, targetId, title) {
  const clean = String(title).trim().slice(0, 60);
  if (!clean) return store;
  return { ...store, documents: store.documents.map(doc => doc.id === targetId ? { ...doc, title: clean, manualTitle: true } : doc) };
}
