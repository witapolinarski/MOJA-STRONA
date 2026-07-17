import XLSX from "xlsx";
import { ENTRY_FEE, MONTHLY_FEE } from "./fees.mjs";
import { findRosterMember, normalizeText } from "./names.mjs";

const MONTH_HEADER =
  /^(sty|cze|lip|sie|wrz|paź|paz|lis|gru|stycze|luty|lut|marzec|mar|kwie|maj|czerw|lipiec|sierp|wrze|październik|listopad|grudzie|\d{1,2})$/i;

const AMOUNT_HEADER = /(kwota|zapłac|zaplac|wpłat|wplat|suma|razem|paid|amount|należn|nalezn|wartość|wartosc|obciąż|obciaz|uznan)/i;
const NAME_HEADER = /(nazw|imię|imie|name|zawodnik|członk|clonk|kontrahent|nadawca|odbiorca)/i;
const PESEL_HEADER = /pesel/i;
const TITLE_HEADER = /(tytuł|tytul|opis|treść|tresc|operac|szczegół|szczegol)/i;
const SENDER_HEADER = /nadawca/i;

const parseAmount = (value) => {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/zł|zl/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizePesel = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{11}$/.test(digits) ? digits : "";
};

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

const detectHeaderRow = (rows) => {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const row = rows[index] || [];
    const joined = row.map((cell) => String(cell).toLowerCase()).join(" ");
    if (
      PESEL_HEADER.test(joined) ||
      /(nazwisko|zawodnik)/i.test(joined) ||
      /(tytuł|tytul|operac)/i.test(joined)
    ) {
      return index;
    }
  }
  return 0;
};

const buildColumnMap = (headers) => {
  const map = { pesel: -1, name: -1, amount: -1, title: -1, monthColumns: [] };

  headers.forEach((header, index) => {
    const label = String(header || "").trim();
    const lower = label.toLowerCase();
    if (map.pesel < 0 && PESEL_HEADER.test(lower)) map.pesel = index;
    if (map.name < 0 && NAME_HEADER.test(lower)) map.name = index;
    if (map.name < 0 && SENDER_HEADER.test(lower)) map.name = index;
    if (map.title < 0 && TITLE_HEADER.test(lower)) map.title = index;
    if (map.amount < 0 && AMOUNT_HEADER.test(lower)) map.amount = index;
    if (MONTH_HEADER.test(lower.replace(/\./g, ""))) map.monthColumns.push(index);
  });

  if (map.name < 0) {
    const nameIndex = headers.findIndex((header) => /nazw/i.test(String(header)));
    if (nameIndex >= 0) map.name = nameIndex;
  }

  if (map.amount < 0) {
    const amountIndex = headers.findIndex((header) => /(kwota|wartość|wartosc|uznan)/i.test(String(header)));
    if (amountIndex >= 0) map.amount = amountIndex;
  }

  return map;
};

const peselFromText = (value) => {
  const match = String(value || "").match(/\b\d{11}\b/);
  return match ? match[0] : "";
};

export const extractBankPartyName = (value) => {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  if (lines.length >= 2 && /^\d[\d\s]+$/.test(lines[0])) {
    return lines[1];
  }

  return lines[0];
};

const pickPaymentName = (row, columns) => {
  const sender = columns.name >= 0 ? String(row[columns.name] || "").trim() : "";
  const title = columns.title >= 0 ? String(row[columns.title] || "").trim() : "";
  const senderName = extractBankPartyName(sender);
  const titleName = extractBankPartyName(title);

  if (senderName && !/^\d[\d\s]+$/.test(senderName)) return senderName;
  if (titleName) return titleName;
  return sender || title || String(row[0] || "").trim();
};

export const parsePaymentsSpreadsheet = (buffer, fileName = "") => {
  let rows = rowsFromWorkbook(buffer);
  if (!rows?.length) rows = rowsFromText(buffer);
  if (!rows?.length) {
    return { records: [], notes: ["Nie udało się odczytać pliku."], headers: [] };
  }

  const headerIndex = detectHeaderRow(rows);
  const headers = (rows[headerIndex] || []).map((cell) => String(cell).trim());
  const columns = buildColumnMap(headers);
  const records = [];
  const notes = [];

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row?.length) continue;

    const peselFromColumn = columns.pesel >= 0 ? normalizePesel(row[columns.pesel]) : "";
    const titleText = columns.title >= 0 ? String(row[columns.title] || "").trim() : "";
    const name = pickPaymentName(row, columns);
    const pesel =
      peselFromColumn ||
      peselFromText(titleText) ||
      peselFromText(name) ||
      normalizePesel(row.find((cell) => normalizePesel(cell)));

    let amount = 0;
    if (columns.amount >= 0) {
      amount = Math.abs(parseAmount(row[columns.amount]));
    } else if (columns.monthColumns.length) {
      amount = columns.monthColumns.reduce((sum, index) => sum + Math.abs(parseAmount(row[index])), 0);
    } else {
      const numericCells = row.map((cell) => Math.abs(parseAmount(cell))).filter((value) => value > 0);
      amount = numericCells.length ? Math.max(...numericCells) : 0;
    }

    if (!pesel && !name) continue;
    if (!amount && !pesel) continue;

    records.push({
      pesel,
      name,
      amount,
    });
  }

  if (!records.length) {
    notes.push("Nie znaleziono wpłat w pliku. Sprawdź, czy są kolumny PESEL i kwoty (lub miesiące).");
  }

  return { records, notes, headers, rowCount: records.length };
};

export const countDueMonths = (memberSince, year, throughMonth) => {
  const since = memberSince ? new Date(`${String(memberSince).slice(0, 10)}T12:00:00`) : null;
  if (!since || Number.isNaN(since.getTime())) return null;

  const joinYear = since.getFullYear();
  const joinMonth = since.getMonth() + 1;

  if (joinYear > year) return 0;

  let startMonth = 1;
  if (joinYear === year) {
    startMonth = joinMonth + 1;
    if (startMonth > 12) return 0;
  }

  if (startMonth > throughMonth) return 0;
  return throughMonth - startMonth + 1;
};

export const calculateExpectedDues = (member, options = {}) => {
  const year = Number(options.year) || new Date().getFullYear();
  const throughMonth = Number(options.throughMonth) || new Date().getMonth() + 1;
  const since = member.memberSince ? String(member.memberSince).slice(0, 10) : null;
  const joinYear = since ? Number(since.slice(0, 4)) : null;

  const months = countDueMonths(since, year, throughMonth);
  if (months == null) {
    return {
      year,
      throughMonth,
      months: null,
      entryFee: 0,
      monthlyTotal: 0,
      total: 0,
      unknown: true,
    };
  }

  const entryFee = joinYear === year ? ENTRY_FEE : 0;
  const monthlyTotal = months * MONTHLY_FEE;

  return {
    year,
    throughMonth,
    months,
    entryFee,
    monthlyTotal,
    total: entryFee + monthlyTotal,
    unknown: false,
  };
};

const indexPayments = (records) => {
  const byPesel = new Map();
  const unmatched = [];

  for (const record of records) {
    if (record.pesel) {
      const current = byPesel.get(record.pesel) || { ...record, amount: 0 };
      current.amount += record.amount;
      current.name = current.name || record.name;
      byPesel.set(record.pesel, current);
      continue;
    }
    unmatched.push(record);
  }

  return { byPesel, unmatched };
};

const buildRosterNameIndex = (members = []) => {
  const index = new Map();

  for (const member of members) {
    const keys = [
      normalizeText(member.displayName),
      normalizeText(`${member.firstName} ${member.lastName}`),
      normalizeText(`${member.lastName} ${member.firstName}`),
      normalizeText(member.fullName),
    ].filter(Boolean);

    for (const key of keys) {
      if (!index.has(key)) index.set(key, member);
    }
  }

  return index;
};

const findMemberForPayment = (payment, members, nameIndex) => {
  if (payment.pesel) {
    const byPesel = members.find((member) => member.pesel === payment.pesel);
    if (byPesel) return byPesel;
  }

  const candidates = [payment.name, extractBankPartyName(payment.name)].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (nameIndex.has(normalized)) return nameIndex.get(normalized);
  }

  return findRosterMember(payment.name, members);
};

const indexPaymentsByMember = (paymentRecords = [], members = []) => {
  const nameIndex = buildRosterNameIndex(members);
  const byMemberId = new Map();
  let unmatchedCount = 0;

  for (const record of paymentRecords) {
    const member = findMemberForPayment(record, members, nameIndex);
    if (!member) {
      unmatchedCount += 1;
      continue;
    }

    const current = byMemberId.get(member.id) || { amount: 0, names: new Set() };
    current.amount += record.amount;
    if (record.name) current.names.add(record.name);
    byMemberId.set(member.id, current);
  }

  return { byMemberId, unmatchedCount };
};

export const reconcileDues = (members = [], paymentRecords = [], options = {}) => {
  const year = Number(options.year) || new Date().getFullYear();
  const throughMonth = Number(options.throughMonth) || new Date().getMonth() + 1;
  const activeMembers = members.filter((member) => member.active !== false);
  const { byMemberId, unmatchedCount } = indexPaymentsByMember(paymentRecords, activeMembers);

  const arrears = [];
  const paid = [];
  const missingFromFile = [];
  const unknownExpectation = [];

  for (const member of activeMembers) {
    const expected = calculateExpectedDues(member, { year, throughMonth });
    const payment = byMemberId.get(member.id);
    const paidAmount = payment?.amount || 0;
    const balance = (expected.total || 0) - paidAmount;

    const row = {
      id: member.id,
      displayName: member.displayName || member.fullName,
      pesel: member.pesel || "",
      memberSince: member.memberSince || "",
      expected,
      paidAmount,
      balance,
      paymentName: payment ? [...payment.names].join(" · ") : null,
    };

    if (expected.unknown) {
      unknownExpectation.push(row);
      continue;
    }

    if (!payment) {
      missingFromFile.push(row);
      if (balance > 0.5) arrears.push(row);
      continue;
    }

    if (balance > 0.5) arrears.push(row);
    else paid.push(row);
  }

  arrears.sort((a, b) => b.balance - a.balance);

  return {
    year,
    throughMonth,
    summary: {
      activeMembers: activeMembers.length,
      rowsInFile: paymentRecords.length,
      withArrears: arrears.length,
      paidUp: paid.length,
      missingFromFile: missingFromFile.length,
      unknownExpectation: unknownExpectation.length,
      extraPayments: unmatchedCount,
      totalArrearsPln: Math.round(arrears.reduce((sum, row) => sum + row.balance, 0) * 100) / 100,
    },
    arrears,
    paid,
    missingFromFile,
    unknownExpectation,
  };
};
