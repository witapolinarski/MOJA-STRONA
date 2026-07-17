import { getApplicationsStore, getFilesStore } from "./store.mjs";

export const PAYMENTS_META_KEY = "meta:club-payments";
export const PAYMENTS_FILE_KEY = "club/payments-register";

export const getPaymentsMeta = async () => {
  const store = getApplicationsStore();
  return store.get(PAYMENTS_META_KEY, { type: "json" });
};

export const getPaymentsFile = async () => {
  const store = getFilesStore();
  const metadata = await store.getMetadata(PAYMENTS_FILE_KEY);
  if (!metadata) return null;

  const data = await store.get(PAYMENTS_FILE_KEY, { type: "blob" });
  if (!data) return null;

  return {
    data,
    contentType: metadata.metadata?.contentType || "application/octet-stream",
    fileName: metadata.metadata?.fileName || "skladki",
  };
};

export const savePaymentsFile = async (file, uploadedBy) => {
  const store = getFilesStore();
  const metaStore = getApplicationsStore();
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "skladki";

  await store.set(PAYMENTS_FILE_KEY, buffer, {
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

  await metaStore.setJSON(PAYMENTS_META_KEY, meta);
  return meta;
};
