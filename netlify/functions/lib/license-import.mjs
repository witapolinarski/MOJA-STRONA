import XLSX from "xlsx";
import { findRosterMember } from "./names.mjs";
import { mergeLicenseIntoMember, normalizeLicenseRecord, parseLicenseValidYear } from "./license-data.mjs";

const LICENSE_HEADER = /(licencj|nr\s*lic|data\s*waż|data\s*waz|data\s*wydan)/i;
const SURNAME_HEADER = /nazwisk/i;
const FIRSTNAME_HEADER = /^imi[eę]$/i;
const VALID_UNTIL_HEADER = /data\s*ważno|data\s*wazno|ważne\s*do|wazne\s*do/i;
const ISSUED_HEADER = /data\s*wydan/i;
const NUMBER_HEADER = /nr\s*licencj|^nr$/i;
const STATUS_HEADER = /^status$/i;

const rowsFromWorkbook = (buffer) => {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  } catch {
    return null;
  }
};

const rowsFromText = (buffer) => {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ";";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
};

const formatDateCell = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const pl = String(value).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (pl) return `${pl[3]}-${pl[2]}-${pl[1]}`;
  return String(value).trim();
};

const detectHeaderRow = (rows) => {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const joined = (rows[index] || []).map((cell) => String(cell).toLowerCase()).join(" ");
    if (LICENSE_HEADER.test(joined) || (SURNAME_HEADER.test(joined) && FIRSTNAME_HEADER.test(joined))) {
      return index;
    }
  }
  return 0;
};

const buildColumnMap = (headers) => {
  const map = {
    lastName: -1,
    firstName: -1,
    licenseNumber: -1,
    issuedAt: -1,
    validUntil: -1,
    status: -1,
  };

  headers.forEach((header, index) => {
    const label = String(header || "").trim();
    const lower = label.toLowerCase();
    if (map.lastName < 0 && SURNAME_HEADER.test(lower)) map.lastName = index;
    if (map.firstName < 0 && FIRSTNAME_HEADER.test(lower)) map.firstName = index;
    if (map.licenseNumber < 0 && NUMBER_HEADER.test(lower)) map.licenseNumber = index;
    if (map.issuedAt < 0 && ISSUED_HEADER.test(lower)) map.issuedAt = index;
    if (map.validUntil < 0 && VALID_UNTIL_HEADER.test(lower)) map.validUntil = index;
    if (map.status < 0 && STATUS_HEADER.test(lower)) map.status = index;
  });

  return map;
};

export const isLicenseRegisterFile = (headers = []) => {
  const joined = headers.map((header) => String(header).toLowerCase()).join(" ");
  return LICENSE_HEADER.test(joined) || (SURNAME_HEADER.test(joined) && VALID_UNTIL_HEADER.test(joined));
};

export const licenseStatusFromExport = ({ validUntil, status, licenseNumber }) => {
  const until = formatDateCell(validUntil);
  const validYear = parseLicenseValidYear(until);
  const untilDate = until ? new Date(`${until}T23:59:59`) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let isCurrent = false;
  if (untilDate && !Number.isNaN(untilDate.getTime())) {
    isCurrent = untilDate >= today;
  } else if (/zatwierdz|ważn|wazn/i.test(String(status || ""))) {
    isCurrent = true;
  }

  return normalizeLicenseRecord({
    status: isCurrent ? "Ważne" : "Nieważne",
    validUntil: until || null,
    licenseNumber: licenseNumber || null,
  });
};

export const parseLicenseRegister = (buffer, fileName = "") => {
  const lowerName = String(fileName).toLowerCase();
  let rows =
    lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || buffer[0] === 0x50
      ? rowsFromWorkbook(buffer)
      : null;

  if (!rows?.length) rows = rowsFromText(buffer);
  if (!rows?.length) {
    return { records: [], notes: ["Nie udało się odczytać pliku."], headers: [] };
  }

  const headerIndex = detectHeaderRow(rows);
  const headers = (rows[headerIndex] || []).map((cell) => String(cell).trim());
  const columns = buildColumnMap(headers);
  const records = [];
  const notes = [];

  if (!isLicenseRegisterFile(headers)) {
    notes.push("Plik nie wygląda na rejestr licencji PZSS (brak kolumn licencji / daty ważności).");
  }

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row?.length) continue;

    const lastName = columns.lastName >= 0 ? String(row[columns.lastName] || "").trim() : "";
    const firstName = columns.firstName >= 0 ? String(row[columns.firstName] || "").trim() : "";
    const displayName = `${lastName} ${firstName}`.trim();
    const validUntil = columns.validUntil >= 0 ? formatDateCell(row[columns.validUntil]) : "";
    const licenseNumber = columns.licenseNumber >= 0 ? String(row[columns.licenseNumber] || "").trim() : "";
    const status = columns.status >= 0 ? String(row[columns.status] || "").trim() : "";

    if (!displayName) continue;

    const license = licenseStatusFromExport({ validUntil, status, licenseNumber });
    records.push({
      displayName,
      lastName,
      firstName,
      licenseNumber: licenseNumber || license.licenseNumber,
      issuedAt: columns.issuedAt >= 0 ? formatDateCell(row[columns.issuedAt]) : "",
      ...license,
    });
  }

  if (!records.length) {
    notes.push("Nie znaleziono wierszy licencji. Sprawdź nagłówki: Nazwisko, Imię, Data ważności.");
  }

  return { records, notes, headers, rowCount: records.length };
};

export const mergeLicenseRegisterIntoRoster = (members = [], licenseRecords = []) => {
  const merged = members.map((member) => ({ ...member }));
  const byId = new Map(merged.map((member) => [member.id, member]));
  let matched = 0;
  let unmatched = [];

  for (const record of licenseRecords) {
    const member = findRosterMember(record.displayName, merged);
    if (!member) {
      unmatched.push(record.displayName);
      continue;
    }

    const target = byId.get(member.id);
    const updated = mergeLicenseIntoMember(target, {
      ...record,
      licenseNumber: record.licenseNumber || target.licenseNumber,
      licenseUpdatedAt: new Date().toISOString(),
    });
    byId.set(member.id, updated);
    matched += 1;
  }

  return {
    members: [...byId.values()].sort((a, b) => String(a.lastName).localeCompare(String(b.lastName), "pl")),
    matched,
    unmatched,
  };
};
