import { getApplicationsStore, getFilesStore } from "./store.mjs";

export const LICENSE_META_KEY = "meta:club-license-register";
export const LICENSE_FILE_KEY = "club/license-register";

export const getLicenseRegisterMeta = async () => {
  const store = getApplicationsStore();
  return store.get(LICENSE_META_KEY, { type: "json" });
};

export const getLicenseRegisterFile = async () => {
  const store = getFilesStore();
  const metadata = await store.getMetadata(LICENSE_FILE_KEY);
  if (!metadata) return null;

  const data = await store.get(LICENSE_FILE_KEY, { type: "blob" });
  if (!data) return null;

  return {
    data,
    contentType: metadata.metadata?.contentType || "application/octet-stream",
    fileName: metadata.metadata?.fileName || "licencje",
  };
};

export const saveLicenseRegisterFile = async (file, uploadedBy) => {
  const store = getFilesStore();
  const metaStore = getApplicationsStore();
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "licencje";

  await store.set(LICENSE_FILE_KEY, buffer, {
    metadata: {
      contentType: file.type || "application/octet-stream",
      fileName,
    },
  });

  const meta = {
    fileName,
    contentType: file.type || "application/octet-stream",
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy || null,
  };

  await metaStore.setJSON(LICENSE_META_KEY, meta);
  return meta;
};
