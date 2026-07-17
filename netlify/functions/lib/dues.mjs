import XLSX from "xlsx";
import { ENTRY_FEE, MONTHLY_FEE } from "./fees.mjs";
import { findRosterMember } from "./names.mjs";

const MONTH_HEADER =
  /^(sty|cze|lip|sie|wrz|paź|paz|lis|gru|stycze|luty|lut|marzec|mar|kwie|maj|czerw|lipiec|sierp|wrze|październik|listopad|grudzie|\d{1,2})$/i;

const AMOUNT_HEADER = /(kwota|zapłac|zaplac|wpłat|wplat|suma|razem|paid|amount|należn|nalezn)/i;
const NAME_HEADER = /(nazw|imię|imie|name|zawodnik|członk|clonk)/i;
const PESEL_HEADER = /pesel/i;

const parseAmount = (value) => {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/zł|zl/gi, "")
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
    if (PESEL_HEADER.test(joined) || /(nazwisko|zawodnik)/i.test(joined)) {
      return index;
    }
  }
  return 0;
};

const buildColumnMap = (headers) => {
  const map = { pesel: -1, name: -1, amount: -1, monthColumns: [] };

  headers.forEach((header, index) => {
    const label = String(header || "").trim();
    const lower = label.toLowerCase();
    if (map.pesel < 0 && PESEL_HEADER.test(lower)) map.pesel = index;
    if (map.name < 0 && NAME_HEADER.test(lower)) map.name = index;
    if (map.amount < 0 && AMOUNT_HEADER.test(lower)) map.amount = index;
    if (MONTH_HEADER.test(lower.replace(/\./g, ""))) map.monthColumns.push(index);
  });

  if (map.name < 0) {
    const nameIndex = headers.findIndex((header) => /nazw/i.test(String(header)));
    if (nameIndex >= 0) map.name = nameIndex;
  }

  return map;
};

export const parsePaymentsSpreadsheet = (buffer, fileName = "") => {
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

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row?.length) continue;

    const pesel = columns.pesel >= 0 ? normalizePesel(row[columns.pesel]) : "";
    const fallbackPesel = pesel || normalizePesel(row.find((cell) => normalizePesel(cell)));
    const name = columns.name >= 0 ? String(row[columns.name] || "").trim() : String(row[0] || "").trim();

    let amount = 0;
    if (columns.amount >= 0) {
      amount = parseAmount(row[columns.amount]);
    } else if (columns.monthColumns.length) {
      amount = columns.monthColumns.reduce((sum, index) => sum + parseAmount(row[index]), 0);
    } else {
      const numericCells = row.map(parseAmount).filter((value) => value > 0);
      amount = numericCells.length ? Math.max(...numericCells) : 0;
    }

    if (!fallbackPesel && !name) continue;
    if (!amount && !fallbackPesel) continue;

    records.push({
      pesel: fallbackPesel,
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

export const reconcileDues = (members = [], paymentRecords = [], options = {}) => {
  const year = Number(options.year) || new Date().getFullYear();
  const throughMonth = Number(options.throughMonth) || new Date().getMonth() + 1;
  const activeMembers = members.filter((member) => member.active !== false);
  const { byPesel, unmatched: paymentsWithoutPesel } = indexPayments(paymentRecords);

  const arrears = [];
  const paid = [];
  const missingFromFile = [];
  const unknownExpectation = [];
  const matchedPesels = new Set();
  const processedMemberIds = new Set();

  for (const member of activeMembers) {
    const expected = calculateExpectedDues(member, { year, throughMonth });
    const payment = member.pesel ? byPesel.get(member.pesel) : null;

    if (payment?.pesel) matchedPesels.add(payment.pesel);

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
      paymentName: payment?.name || null,
    };

    if (expected.unknown) {
      unknownExpectation.push(row);
      processedMemberIds.add(member.id);
      continue;
    }

    processedMemberIds.add(member.id);

    if (!payment) {
      missingFromFile.push(row);
      if (balance > 0.5) arrears.push(row);
      continue;
    }

    if (balance > 0.5) arrears.push(row);
    else paid.push(row);
  }

  const extraPayments = [];
  for (const [pesel, payment] of byPesel.entries()) {
    if (matchedPesels.has(pesel)) continue;
    const rosterMatch = activeMembers.find((member) => member.pesel === pesel) || null;
    extraPayments.push({
      pesel,
      name: payment.name,
      amount: payment.amount,
      rosterMatch: rosterMatch?.displayName || null,
    });
  }

  for (const payment of paymentsWithoutPesel) {
    const rosterMatch = findRosterMember(payment.name, activeMembers);
    if (!rosterMatch) {
      extraPayments.push({
        pesel: "",
        name: payment.name,
        amount: payment.amount,
        rosterMatch: null,
      });
      continue;
    }

    if (processedMemberIds.has(rosterMatch.id)) continue;
    processedMemberIds.add(rosterMatch.id);
    if (rosterMatch.pesel) matchedPesels.add(rosterMatch.pesel);

    const expected = calculateExpectedDues(rosterMatch, { year, throughMonth });
    const balance = (expected.total || 0) - payment.amount;
    const row = {
      id: rosterMatch.id,
      displayName: rosterMatch.displayName || rosterMatch.fullName,
      pesel: rosterMatch.pesel || "",
      memberSince: rosterMatch.memberSince || "",
      expected,
      paidAmount: payment.amount,
      balance,
      paymentName: payment.name,
      matchedByName: true,
    };

    if (expected.unknown) {
      unknownExpectation.push(row);
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
      extraPayments: extraPayments.length,
      totalArrearsPln: Math.round(arrears.reduce((sum, row) => sum + row.balance, 0) * 100) / 100,
    },
    arrears,
    paid,
    missingFromFile,
    unknownExpectation,
    extraPayments,
  };
};
