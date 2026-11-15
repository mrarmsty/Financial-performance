/* store.js - browser-local persistence in IndexedDB.
   The working dataset and the upload history are saved in this browser only. Nothing is sent to any server,
   and other visitors of the dashboard never see these changes. If IndexedDB is unavailable (private window,
   blocked storage), the dashboard keeps working in memory for the current session. */
(function () {
  'use strict';
  const DB = 'fin-dashboard', VERSION = 1, STORE = 'state';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(DB, VERSION);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }
  async function tx(mode, fn) {
    const db = await open(); if (!db) return { ok: false };
    return new Promise((resolve) => {
      try {
        const t = db.transaction(STORE, mode); const s = t.objectStore(STORE); const out = fn(s);
        t.oncomplete = () => resolve({ ok: true, value: out && out.result });
        t.onerror = () => resolve({ ok: false });
        t.onabort = () => resolve({ ok: false });
      } catch (e) { resolve({ ok: false }); }
    });
  }
  // state: { records, batches: [{id, file, mode, at, summary, snapshot}], updatedAt }
  const save = (state) => tx('readwrite', (s) => s.put(state, 'working'));
  const load = async () => { const r = await tx('readonly', (s) => s.get('working')); return r.ok ? r.value || null : null; };
  const clear = () => tx('readwrite', (s) => s.delete('working'));
  const available = async () => !!(await open());

  window.FinStore = { save, load, clear, available };
})();
