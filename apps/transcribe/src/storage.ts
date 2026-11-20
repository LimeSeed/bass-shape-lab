export type Marker = { id: string; time: number; label: string; end?: number };
export type CueMarker = { id: string; time: number; label: string };

export type PracticeSettings = {
  position: number;
  speed: number;
  /** The user-selected R target; changing playback speed does not overwrite it. */
  practiceSpeed: number;
  pitch: number;
  a: number;
  b: number;
  /** False until a current loop range has been deliberately established. */
  regionSet?: boolean;
  /** Saved section from which the temporary a/b selection originated, if still matching. */
  activeMarkerId?: string;
  loop: boolean;
  gap: number;
  rewind: number;
  step: number;
  fineStep: number;
  eq: number[];
  markers: Marker[];
  cueMarkers?: CueMarker[];
  markerMode?: 'node' | 'range';
};

export type Song = {
  id: string;
  name: string;
  size: number;
  type: string;
  duration: number;
  createdAt: number;
  updatedAt: number;
  settings: PracticeSettings;
  blob?: Blob;
  /** True only when an audio Blob has been committed to IndexedDB. */
  audioSaved?: boolean;
};

export type SaveResult = { audioSaved: boolean; warning?: string };

const DB_NAME = 'bass-transcribe-lab-v1';
const META = 'songs';
const AUDIO = 'audio';
let opening: Promise<IDBDatabase> | undefined;

export function defaultSettings(duration: number): PracticeSettings {
  return {
    position: 0, speed: 1, practiceSpeed: 0.75, pitch: 0,
    a: 0, b: Math.max(0, duration), regionSet: false, loop: false, gap: 0,
    rewind: 0, step: 3, fineStep: 1, eq: [0, 0, 0], markers: [], cueMarkers: [], markerMode: 'node',
  };
}

function storageError(error: unknown, action: string): Error {
  const name = error && typeof error === 'object' && 'name' in error
    ? String(error.name) : '';
  if (name === 'QuotaExceededError') {
    return new Error(`${action}失败：设备可用存储不足。请删除不需要的歌曲或释放设备空间；本次仍可继续练习。`);
  }
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new Error(`${action}失败：浏览器未允许此页面使用本地存储。请检查浏览器设置；本次仍可继续练习。`);
  }
  return new Error(`${action}失败：本地存储暂时不可用。请检查浏览器存储权限、退出隐私模式后重试。`);
}

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('此浏览器未提供本地数据库，本次可继续练习，但无法保存歌曲。'));
      return;
    }
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error('本地数据库未能及时打开，请关闭此应用的其他旧标签页后重试。'));
    }, 5000);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      clearTimeout(timer);
      reject(storageError(error, '打开歌曲库'));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      if (finished) { db.close(); return; }
      finished = true;
      db.onversionchange = () => { db.close(); opening = undefined; };
      db.onclose = () => { opening = undefined; };
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      reject(storageError(request.error, '打开歌曲库'));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      reject(new Error('歌曲库被其他旧标签页占用，请关闭旧标签页后重试。'));
    };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

function complete(transaction: IDBTransaction, action: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(storageError(transaction.error, action));
    transaction.onerror = () => { /* onabort reports the final transaction error. */ };
  });
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error, '读取歌曲库'));
  });
}

/** Only reads the metadata store, so opening the library never loads every audio Blob. */
export async function listSongs(): Promise<Song[]> {
  const db = await openDatabase();
  const tx = db.transaction(META, 'readonly');
  const songs = await read<Song[]>(tx.objectStore(META).getAll());
  return songs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSong(id: string): Promise<Song | undefined> {
  const db = await openDatabase();
  const tx = db.transaction([META, AUDIO], 'readonly');
  const [song, audio] = await Promise.all([
    read<Song | undefined>(tx.objectStore(META).get(id)),
    read<{ id: string; blob: Blob } | undefined>(tx.objectStore(AUDIO).get(id)),
  ]);
  if (!song) return undefined;
  return { ...song, audioSaved: !!audio?.blob, blob: audio?.blob };
}

/** The read/merge/write happens in one transaction; settings updates never touch audio. */
async function writeSong(song: Song, includeAudio: boolean): Promise<boolean> {
  const db = await openDatabase();
  const tx = db.transaction(includeAudio ? [META, AUDIO] : [META], 'readwrite');
  const done = complete(tx, '保存歌曲');
  let audioSaved = false;
  let writeError: unknown;
  const { blob: _blob, ...metadata } = song;
  const request = tx.objectStore(META).get(song.id);
  request.onsuccess = () => {
    try {
      const previous = request.result as Song | undefined;
      audioSaved = includeAudio || previous?.audioSaved === true;
      tx.objectStore(META).put({ ...metadata, updatedAt: Date.now(), audioSaved });
      if (includeAudio) tx.objectStore(AUDIO).put({ id: song.id, blob: song.blob });
    } catch (error) {
      writeError = error;
      tx.abort();
    }
  };
  try { await done; }
  catch (error) { throw writeError ? storageError(writeError, '保存歌曲') : error; }
  return audioSaved;
}

/** On audio quota failure, preserve usable practice metadata and report the partial save. */
export async function saveSong(song: Song): Promise<SaveResult> {
  if (!song.blob) return { audioSaved: await writeSong(song, false) };
  try {
    return { audioSaved: await writeSong(song, true) };
  } catch (audioError) {
    const audioSaved = await writeSong(song, false);
    return {
      audioSaved,
      warning: `${audioError instanceof Error ? audioError.message : storageError(audioError, '保存音频').message}练习参数已保存；若歌曲没有本地音频副本，下次需要重新选择原文件。`,
    };
  }
}

export async function saveSettings(id: string, settings: PracticeSettings): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(META, 'readwrite');
  const done = complete(tx, '保存练习参数');
  let writeError: unknown;
  const request = tx.objectStore(META).get(id);
  request.onsuccess = () => {
    try {
      const existing = request.result as Song | undefined;
      // A late autosave after deletion must not recreate a deleted song.
      if (existing) tx.objectStore(META).put({ ...existing, settings, updatedAt: Date.now() });
    } catch (error) {
      writeError = error;
      tx.abort();
    }
  };
  try { await done; }
  catch (error) { throw writeError ? storageError(writeError, '保存练习参数') : error; }
}

export async function deleteSong(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([META, AUDIO], 'readwrite');
  const done = complete(tx, '删除歌曲');
  tx.objectStore(META).delete(id);
  tx.objectStore(AUDIO).delete(id);
  await done;
}

/** Browsers may deny persistence; false means best-effort storage, never an upload. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}
