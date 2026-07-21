import { getApplicationsStore, getFilesStore } from "./store.mjs";

export const PAYMENTS_META_KEY = "meta:club-payments";
export const PAYMENTS_FILE_KEY = "club/payments-register";
export const PAYMENTS_ANALYSIS_KEY = "meta:club-payments-analysis";

export const PAYMENTS_PARSED_KEY = "meta:club-payments-parsed";

const ANALYSIS_VERSION = 7;

const analysisStamp = (meta = {}) =>
  `v${ANALYSIS_VERSION}:${meta.uploadedAt || ""}:${meta.size || 0}:${meta.fileName || ""}`;

export const clearPaymentsAnalysis = async () => {
  const store = getApplicationsStore();
  await store.delete(PAYMENTS_ANALYSIS_KEY);
};

export const getPaymentsAnalysis = async (fileMeta) => {
  if (!fileMeta?.uploadedAt) return null;

  const store = getApplicationsStore();
  const cached = await store.get(PAYMENTS_ANALYSIS_KEY, { type: "json" });
  if (!cached?.reconciliation) return null;
  if (cached.fileStamp !== analysisStamp(fileMeta)) return null;

  return cached;
};

export const savePaymentsAnalysis = async (fileMeta, result) => {
  const store = getApplicationsStore();
  await store.setJSON(PAYMENTS_ANALYSIS_KEY, {
    fileStamp: analysisStamp(fileMeta),
    cachedAt: new Date().toISOString(),
    parse: result.parse,
    reconciliation: result.reconciliation,
  });
};

export const getPaymentsParsed = async (fileMeta) => {
  if (!fileMeta?.uploadedAt) return null;

  const store = getApplicationsStore();
  const cached = await store.get(PAYMENTS_PARSED_KEY, { type: "json" });
  if (!cached?.records) return null;
  if (cached.fileStamp !== analysisStamp(fileMeta)) return null;

  return cached;
};

export const savePaymentsParsed = async (fileMeta, parsed) => {
  const store = getApplicationsStore();
  await store.setJSON(PAYMENTS_PARSED_KEY, {
    fileStamp: analysisStamp(fileMeta),
    cachedAt: new Date().toISOString(),
    records: parsed.records,
    rowCount: parsed.rowCount,
    notes: parsed.notes,
  });
};

export const clearPaymentsParsed = async () => {
  const store = getApplicationsStore();
  await store.delete(PAYMENTS_PARSED_KEY);
};

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
  await clearPaymentsAnalysis();
  await clearPaymentsParsed();
  return meta;
};

export const savePaymentsBuffer = async (buffer, fileName, uploadedBy, contentType = "text/plain") => {
  const store = getFilesStore();
  const metaStore = getApplicationsStore();

  await store.set(PAYMENTS_FILE_KEY, buffer, {
    metadata: {
      contentType,
      fileName,
    },
  });

  const meta = {
    fileName,
    contentType,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy || null,
  };

  await metaStore.setJSON(PAYMENTS_META_KEY, meta);
  await clearPaymentsAnalysis();
  await clearPaymentsParsed();
  return meta;
};
