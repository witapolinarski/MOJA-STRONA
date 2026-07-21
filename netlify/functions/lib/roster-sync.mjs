import { applyStruckOffFlags } from "./fees.mjs";
import { getRosterExportFile } from "./roster-file.mjs";
import {
  ensureRosterSeeded,
  getRosterRecord,
  mergePzssRosterImport,
  parsePzssRosterText,
  saveRosterMembers,
} from "./roster.mjs";

const decodeRosterText = (buffer) => {
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("\t") || /[ąćęłńóśźż]/i.test(utf8)) return utf8;
  return buffer.toString("latin2");
};

export const importPzssRosterText = async (text, meta = {}) => {
  const members = parsePzssRosterText(text);
  if (!members.length) {
    throw new Error("Nie udało się odczytać listy członków z eksportu PZSS.");
  }

  await ensureRosterSeeded();
  const current = await getRosterRecord();
  const merged = applyStruckOffFlags(mergePzssRosterImport(current.members || [], members));

  return saveRosterMembers(merged, {
    source: meta.source || "pzss-sync",
    importedBy: meta.importedBy || null,
  });
};

export const importPzssRosterBuffer = async (buffer, meta = {}) =>
  importPzssRosterText(decodeRosterText(buffer), meta);

export const syncRosterFromStoredExport = async (meta = {}) => {
  const file = await getRosterExportFile();
  if (!file) {
    throw new Error("Brak zapisanego eksportu PZSS. Wgraj plik lub wklej listę w zakładce Baza PZSS.");
  }

  const buffer = Buffer.from(await file.data.arrayBuffer());
  return importPzssRosterBuffer(buffer, {
    ...meta,
    source: meta.source || "pzss-export-file",
  });
};

export const syncRosterFromUrl = async (url, meta = {}) => {
  const response = await fetch(url, {
    headers: { Accept: "text/plain,text/csv,*/*" },
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać eksportu PZSS (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return importPzssRosterBuffer(buffer, {
    ...meta,
    source: meta.source || "pzss-url",
  });
};

export const runPzssRosterSync = async (meta = {}) => {
  const url = String(process.env.PZSS_ROSTER_URL || "").trim();
  if (url) {
    return syncRosterFromUrl(url, { ...meta, source: meta.source || "pzss-url-auto" });
  }

  return syncRosterFromStoredExport({ ...meta, source: meta.source || "pzss-export-auto" });
};
