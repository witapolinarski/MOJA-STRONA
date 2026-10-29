// Warstwa magazynu danych kalendarza OZSS.
//
// Na Netlify (produkcja i `netlify dev`) używamy prawdziwego Netlify Blobs.
// Poza tym środowiskiem (testy jednostkowe, `node test.mjs` na tej maszynie,
// podgląd lokalny bez konta Netlify) przechodzimy automatycznie na prosty
// magazyn plikowy w katalogu ozss/.data — żeby całość dała się sprawdzić
// bez żadnej konfiguracji w chmurze.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// OZSS_LOCAL_DATA_DIR pozwala testom uruchamianym równolegle (różne procesy
// node --test) używać osobnych katalogów, żeby się wzajemnie nie czyściły.
const LOCAL_DATA_ROOT = process.env.OZSS_LOCAL_DATA_DIR
  ? path.resolve(process.env.OZSS_LOCAL_DATA_DIR)
  : path.resolve(__dirname, "../../../.data");

const isNetlifyRuntime = () =>
  Boolean(
    process.env.NETLIFY_BLOBS_CONTEXT ||
      process.env.NETLIFY_DEV ||
      process.env.NETLIFY,
  );

const localKeyToFile = (storeName, key, ext) => {
  const safeKey = encodeURIComponent(key);
  return path.join(LOCAL_DATA_ROOT, storeName, `${safeKey}.${ext}`);
};

const localMetaFile = (storeName, key) => localKeyToFile(storeName, key, "meta.json");

const ensureDir = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true });

class LocalFileStore {
  constructor(name) {
    this.name = name;
  }

  async get(key, { type = "text" } = {}) {
    const jsonFile = localKeyToFile(this.name, key, "json");
    if (type === "json") {
      if (!fs.existsSync(jsonFile)) return null;
      return JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    }

    const binFile = localKeyToFile(this.name, key, "bin");
    if (!fs.existsSync(binFile)) return null;
    const buffer = fs.readFileSync(binFile);

    if (type === "blob") {
      return new Blob([buffer]);
    }
    if (type === "text") {
      return buffer.toString("utf8");
    }
    return buffer;
  }

  async setJSON(key, value) {
    const file = localKeyToFile(this.name, key, "json");
    ensureDir(file);
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
  }

  async set(key, data, { metadata = {} } = {}) {
    const file = localKeyToFile(this.name, key, "bin");
    ensureDir(file);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(file, buffer);

    const metaFile = localMetaFile(this.name, key);
    ensureDir(metaFile);
    fs.writeFileSync(metaFile, JSON.stringify({ metadata }, null, 2), "utf8");
  }

  async getMetadata(key) {
    const metaFile = localMetaFile(this.name, key);
    if (!fs.existsSync(metaFile)) return null;
    return JSON.parse(fs.readFileSync(metaFile, "utf8"));
  }

  async delete(key) {
    for (const ext of ["json", "bin", "meta.json"]) {
      const file = localKeyToFile(this.name, key, ext);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  async list({ prefix = "" } = {}) {
    const dir = path.join(LOCAL_DATA_ROOT, this.name);
    if (!fs.existsSync(dir)) return { blobs: [] };

    const blobs = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"))
      .map((file) => decodeURIComponent(file.slice(0, -".json".length)))
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ key }));

    return { blobs };
  }
}

let blobsModulePromise = null;
const loadBlobsModule = () => {
  if (!blobsModulePromise) blobsModulePromise = import("@netlify/blobs");
  return blobsModulePromise;
};

const stores = new Map();

export const getNamedStore = (name) => {
  if (stores.has(name)) return stores.get(name);

  let store;
  if (isNetlifyRuntime()) {
    // Ładowane leniwie: poza Netlify ten import nie jest potrzebny, a pakiet
    // i tak nie jest wymagany do testów lokalnych.
    store = {
      async get(key, options) {
        const { getStore } = await loadBlobsModule();
        return getStore({ name, consistency: "strong" }).get(key, options);
      },
      async setJSON(key, value) {
        const { getStore } = await loadBlobsModule();
        return getStore({ name, consistency: "strong" }).setJSON(key, value);
      },
      async set(key, data, options) {
        const { getStore } = await loadBlobsModule();
        return getStore({ name, consistency: "strong" }).set(key, data, options);
      },
      async getMetadata(key) {
        const { getStore } = await loadBlobsModule();
        return getStore({ name, consistency: "strong" }).getMetadata(key);
      },
      async delete(key) {
        const { getStore } = await loadBlobsModule();
        return getStore({ name, consistency: "strong" }).delete(key);
      },
      async list(options) {
        const { getStore } = await loadBlobsModule();
        return getStore({ name, consistency: "strong" }).list(options);
      },
    };
  } else {
    store = new LocalFileStore(name);
  }

  stores.set(name, store);
  return store;
};

export const STORE_CLUBS = "ozss-clubs";
export const STORE_JUDGES = "ozss-judges";
export const STORE_COMPETITIONS = "ozss-competitions";
export const STORE_FILES = "ozss-files";
export const STORE_META = "ozss-meta";

export const getClubsStore = () => getNamedStore(STORE_CLUBS);
export const getJudgesStore = () => getNamedStore(STORE_JUDGES);
export const getCompetitionsStore = () => getNamedStore(STORE_COMPETITIONS);
export const getFilesStore = () => getNamedStore(STORE_FILES);
export const getMetaStore = () => getNamedStore(STORE_META);

export const saveFile = async (prefix, field, file) => {
  const store = getFilesStore();
  const key = `${prefix}/${field}/${Date.now()}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await store.set(key, buffer, {
    metadata: {
      contentType: file.type || "application/octet-stream",
      fileName: file.name || field,
    },
  });
  return {
    key,
    fileName: file.name || field,
    contentType: file.type || "application/octet-stream",
    size: buffer.length,
  };
};

export const getFile = async (key) => {
  const store = getFilesStore();
  const metaWrapper = await store.getMetadata(key);
  if (!metaWrapper) return null;

  const data = await store.get(key, { type: "blob" });
  if (!data) return null;

  return {
    data,
    contentType: metaWrapper.metadata?.contentType || "application/octet-stream",
    fileName: metaWrapper.metadata?.fileName || "plik",
  };
};

// Pomocne w testach, żeby każdy test startował z czystym magazynem lokalnym.
export const __resetLocalStoreForTests = () => {
  if (fs.existsSync(LOCAL_DATA_ROOT)) {
    fs.rmSync(LOCAL_DATA_ROOT, { recursive: true, force: true });
  }
  stores.clear();
};
