import { getApplicationsStore, getFilesStore } from "./store.mjs";

export const ROSTER_EXPORT_META_KEY = "meta:club-roster-export";
export const ROSTER_EXPORT_FILE_KEY = "club/pzss-roster-export";

export const getRosterExportMeta = async () => {
  const store = getApplicationsStore();
  return store.get(ROSTER_EXPORT_META_KEY, { type: "json" });
};

export const getRosterExportFile = async () => {
  const store = getFilesStore();
  const metadata = await store.getMetadata(ROSTER_EXPORT_FILE_KEY);
  if (!metadata) return null;

  const data = await store.get(ROSTER_EXPORT_FILE_KEY, { type: "blob" });
  if (!data) return null;

  return {
    data,
    contentType: metadata.metadata?.contentType || "text/plain",
    fileName: metadata.metadata?.fileName || "pzss-roster.txt",
  };
};

export const saveRosterExportFile = async (file, uploadedBy) => {
  const store = getFilesStore();
  const metaStore = getApplicationsStore();
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "pzss-roster.txt";

  await store.set(ROSTER_EXPORT_FILE_KEY, buffer, {
    metadata: {
      contentType: file.type || "text/plain",
      fileName,
    },
  });

  const meta = {
    fileName,
    contentType: file.type || "text/plain",
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy || null,
  };

  await metaStore.setJSON(ROSTER_EXPORT_META_KEY, meta);
  return meta;
};

export const saveRosterExportBuffer = async (buffer, fileName = "pzss-roster.txt", uploadedBy = null) => {
  const store = getFilesStore();
  const metaStore = getApplicationsStore();

  await store.set(ROSTER_EXPORT_FILE_KEY, buffer, {
    metadata: {
      contentType: "text/plain",
      fileName,
    },
  });

  const meta = {
    fileName,
    contentType: "text/plain",
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };

  await metaStore.setJSON(ROSTER_EXPORT_META_KEY, meta);
  return meta;
};
