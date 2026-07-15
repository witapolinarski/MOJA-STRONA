import { getStore } from "@netlify/blobs";

const APPLICATIONS_STORE = "sagittarius-applications";
const FILES_STORE = "sagittarius-files";

export const getApplicationsStore = () =>
  getStore({ name: APPLICATIONS_STORE, consistency: "strong" });

export const getFilesStore = () => getStore({ name: FILES_STORE, consistency: "strong" });

export const saveApplication = async (application) => {
  const store = getApplicationsStore();
  await store.setJSON(application.code, application);
  return application;
};

export const getApplication = async (code) => {
  const store = getApplicationsStore();
  return store.get(code, { type: "json" });
};

export const listApplications = async () => {
  const store = getApplicationsStore();
  const { blobs } = await store.list();
  const applications = await Promise.all(
    blobs.map(async ({ key }) => store.get(key, { type: "json" })),
  );
  return applications
    .filter(Boolean)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
};

export const saveFile = async (code, field, file) => {
  const store = getFilesStore();
  const key = `${code}/${field}`;
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

export const getFile = async (code, field) => {
  const store = getFilesStore();
  const key = `${code}/${field}`;
  const metadata = await store.getMetadata(key);
  if (!metadata) return null;

  const data = await store.get(key, { type: "blob" });
  if (!data) return null;

  return {
    data,
    contentType: metadata.metadata?.contentType || "application/octet-stream",
    fileName: metadata.metadata?.fileName || field,
  };
};
