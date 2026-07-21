import XLSX from "xlsx";
import {
  ANNUAL_FEE_EARLY,
  ANNUAL_FEE_LATE,
  ENTRY_FEE,
  LICENSE_FEE_ANNUAL,
  annualMembershipFee,
  annualMembershipFeeForMemberYear,
  calculateAnnualMembershipTotal,
  listDueMembershipYears,
} from "./fees.mjs";
import { buildRosterNameIndex, buildMemberTextPatternIndex, findMemberInPaymentText, matchPaymentToMember, normalizeText } from "./names.mjs";

const MONTH_HEADER =
  /^(sty|cze|lip|sie|wrz|paź|paz|lis|gru|stycze|luty|lut|marzec|mar|kwie|maj|czerw|lipiec|sierp|wrze|październik|listopad|grudzie|\d{1,2})$/i;

const AMOUNT_HEADER = /(kwota|zapłac|zaplac|wpłat|wplat|suma|razem|paid|amount|należn|nalezn|wartość|wartosc)/i;
const CREDIT_HEADER = /(uznan|wpływ|wplyw|przych)/i;
const DEBIT_HEADER = /(obciąż|obciaz|rozch)/i;
const TYPE_HEADER = /(typ|rodzaj)/i;
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
  const map = { pesel: -1, name: -1, amount: -1, credit: -1, debit: -1, title: -1, type: -1, monthColumns: [] };

  headers.forEach((header, index) => {
    const label = String(header || "").trim();
    const lower = label.toLowerCase();
    if (map.pesel < 0 && PESEL_HEADER.test(lower)) map.pesel = index;
    if (map.name < 0 && NAME_HEADER.test(lower)) map.name = index;
    if (map.name < 0 && SENDER_HEADER.test(lower)) map.name = index;
    if (map.title < 0 && TITLE_HEADER.test(lower)) map.title = index;
    if (map.type < 0 && TYPE_HEADER.test(lower)) map.type = index;
    if (map.credit < 0 && CREDIT_HEADER.test(lower)) map.credit = index;
    if (map.debit < 0 && DEBIT_HEADER.test(lower)) map.debit = index;
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

const INCOMING_TYPE = /(uznan|wpływ|wplyw|przych|wpłata|wplata)/i;

const readIncomingAmount = (row, columns) => {
  if (columns.credit >= 0) {
    return Math.abs(parseAmount(row[columns.credit]));
  }

  if (columns.amount >= 0) {
    const raw = String(row[columns.amount] ?? "").trim();
    const parsed = parseAmount(raw);
    if (!parsed) return 0;

    if (columns.debit >= 0 && Math.abs(parseAmount(row[columns.debit])) > 0) {
      return 0;
    }

    if (/^-/.test(raw) || /^\(.*\)$/.test(raw)) return 0;
    return Math.abs(parsed);
  }

  if (columns.monthColumns.length) {
    return columns.monthColumns.reduce((sum, index) => sum + Math.abs(parseAmount(row[index])), 0);
  }

  const numericCells = row.map((cell) => Math.abs(parseAmount(cell))).filter((value) => value > 0);
  return numericCells.length ? Math.max(...numericCells) : 0;
};

const isIncomingTransaction = (row, columns) => {
  if (columns.type < 0) return true;
  const type = String(row[columns.type] || "").trim();
  if (!type) return true;
  return INCOMING_TYPE.test(type);
};

const peselFromText = (value) => {
  const match = String(value || "").match(/\b\d{11}\b/);
  return match ? match[0] : "";
};

const isAccountNumberPart = (value) => {
  const compact = String(value || "").replace(/\s/g, "");
  if (!compact) return false;
  if (/^\d[\d\s]+$/.test(compact)) return true;
  if (/^PL\d{10,}$/i.test(compact)) return true;
  return false;
};

export const extractBankPartyName = (value) => {
  const parts = String(value || "")
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s*\/\s*/))
    .map((line) => line.trim())
    .filter(Boolean);

  if (!parts.length) return "";

  for (const part of parts) {
    if (isAccountNumberPart(part)) continue;
    return part;
  }

  return parts[0];
};

const pickPaymentName = (row, columns) => {
  const sender = columns.name >= 0 ? String(row[columns.name] || "").trim() : "";
  const title = columns.title >= 0 ? String(row[columns.title] || "").trim() : "";
  const senderName = extractBankPartyName(sender);
  const titleName = extractBankPartyName(title);

  if (senderName && !isAccountNumberPart(senderName)) return senderName;
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
    const sender = columns.name >= 0 ? String(row[columns.name] || "").trim() : "";
    const name = pickPaymentName(row, columns);
    const pesel =
      peselFromColumn ||
      peselFromText(titleText) ||
      peselFromText(name) ||
      normalizePesel(row.find((cell) => normalizePesel(cell)));

    if (!isIncomingTransaction(row, columns)) continue;

    const amount = readIncomingAmount(row, columns);

    if (!pesel && !name) continue;
    if (!amount && !pesel) continue;

    records.push({
      pesel,
      name,
      sender,
      title: titleText,
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

export const countLifetimeDueMonths = (memberSince, asOf = new Date()) => {
  const since = memberSince ? new Date(`${String(memberSince).slice(0, 10)}T12:00:00`) : null;
  if (!since || Number.isNaN(since.getTime())) return null;

  let year = since.getFullYear();
  let month = since.getMonth() + 2;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  const endYear = asOf.getFullYear();
  const endMonth = asOf.getMonth() + 1;

  if (year > endYear || (year === endYear && month > endMonth)) return 0;

  let count = 0;
  let currentYear = year;
  let currentMonth = month;

  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    count += 1;
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  return count;
};

export const countLicenseYearsDue = (member, asOf = new Date()) => {
  const since = member.memberSince ? String(member.memberSince).slice(0, 10) : null;
  if (!since) return 0;

  const joinYear = Number(since.slice(0, 4));
  const asOfYear = asOf.getFullYear();
  if (!joinYear || joinYear > asOfYear) return 0;

  const hasLicenseData =
    member.licenseActive === true ||
    member.licenseActive === false ||
    member.licenseStatus ||
    member.licenseValidYear ||
    member.licenseLastValidYear;

  if (!hasLicenseData) return 0;

  const dueYears = listDueMembershipYears(since, asOf) || [];
  if (!dueYears.length) return 0;

  if (member.licenseActive === true) {
    return dueYears.length;
  }

  if (member.licenseActive === false) {
    const lastValid = Number(member.licenseLastValidYear) || joinYear;
    const lastValidIndex = dueYears.filter((year) => year <= lastValid).length;
    return Math.max(lastValidIndex, 1);
  }

  return dueYears.length;
};

export const classifyPaymentPurpose = (record) => {
  const title = normalizeText(record.title || "");
  if (!title) return "unknown";

  if (
    /impreza|turniej|kolacja|bankiet|darowizn|bilet|zawody|startowe|trening otwarty|zwrot|faktur|dotacj|przekazanie dotacji|przekazanie srodk|dopłata do faktury|patent strzel|egzaminu na patent|rachunek \d|zaplata za rk|zapłata za rk|zapl\.za rachunek/.test(
      title,
    )
  ) {
    return "exclude";
  }
  if (/wpisow/.test(title)) return "entry";
  if (/licencj/.test(title) && !/(skladk|składk|czlonkostw|członkostw)/.test(title)) return "license";
  if (
    /skladk|składk|czlonkostw|członkostw|membership|sagittarius|oplata za czlonk|opłata za członk|czlonkowsk/.test(
      title,
    )
  ) {
    return "membership";
  }

  return "unknown";
};

const insuranceDeduction = (title, amount) => {
  const normalized = normalizeText(title);
  if (!/ubezp|ubezpieczen/.test(normalized)) return 0;

  const explicit = normalized.match(/(\d+)\s*zl?\s*ubezp|ubezp[^0-9]*(\d+)/);
  if (explicit) return Math.min(amount, Number(explicit[1] || explicit[2]) || 0);

  if (normalized.includes("wpisowe") && amount > ENTRY_FEE) return Math.max(0, amount - ENTRY_FEE);
  if (amount % 10 === 8 && amount > 8) return 8;

  return Math.min(amount, 50);
};

export const splitPaymentAmounts = (record) => {
  const title = record.title || "";
  const normalized = normalizeText(title);
  const amount = record.amount || 0;
  const excluded = insuranceDeduction(title, amount);
  let remaining = Math.max(0, amount - excluded);

  const hasLicense = /licencj/.test(normalized);
  const hasMembership = /(skladk|składk|czlonkostw|członkostw|membership|sagittarius|czlonkowsk)/.test(
    normalized,
  );
  const hasEntry = /wpisow/.test(normalized);

  const buckets = { entry: 0, license: 0, membership: 0, excluded, unknown: 0 };

  if (classifyPaymentPurpose(record) === "exclude") {
    return { entry: 0, license: 0, membership: 0, excluded: amount, unknown: 0 };
  }

  if (hasEntry) {
    const entryPart = Math.min(ENTRY_FEE, remaining);
    buckets.entry += entryPart;
    remaining -= entryPart;
  }

  if (hasLicense && hasMembership) {
    if (remaining <= LICENSE_FEE_ANNUAL) {
      buckets.license += remaining;
      return buckets;
    }
    buckets.license += LICENSE_FEE_ANNUAL;
    buckets.membership += remaining - LICENSE_FEE_ANNUAL;
    return buckets;
  }

  const purpose = classifyPaymentPurpose(record);
  if (purpose === "entry") {
    buckets.entry += remaining;
    return buckets;
  }
  if (purpose === "license") {
    buckets.license += remaining;
    return buckets;
  }
  if (purpose === "membership") {
    buckets.membership += remaining;
    return buckets;
  }

  buckets.unknown += remaining;
  return buckets;
};

const emptyPaymentBuckets = () => ({
  amount: 0,
  entry: 0,
  license: 0,
  membership: 0,
  unknown: 0,
  excluded: 0,
  names: new Set(),
});

export const allocatePaymentToDues = (expected, paidAmount = 0, buckets = null) => {
  if (!buckets) {
    let remaining = paidAmount;

    const paidEntry = Math.min(remaining, expected.entryFee || 0);
    remaining -= paidEntry;

    const paidLicense = Math.min(remaining, expected.licenseTotal || 0);
    remaining -= paidLicense;

    const paidMonthly = Math.min(remaining, expected.monthlyTotal || 0);
    remaining -= paidMonthly;

    const balanceEntry = (expected.entryFee || 0) - paidEntry;
    const balanceLicense = (expected.licenseTotal || 0) - paidLicense;
    const balanceMonthly = (expected.monthlyTotal || 0) - paidMonthly;

    return {
      paidEntry,
      paidLicense,
      paidMonthly,
      balanceEntry,
      balanceLicense,
      balanceMonthly,
      overpaid: Math.max(0, remaining),
    };
  }

  let paidEntry = Math.min(buckets.entry, expected.entryFee || 0);
  let paidLicense = Math.min(buckets.license, expected.licenseTotal || 0);
  let paidMonthly = Math.min(buckets.membership, expected.monthlyTotal || 0);

  let remaining = buckets.unknown;

  const entryGap = (expected.entryFee || 0) - paidEntry;
  const toEntry = Math.min(remaining, entryGap);
  paidEntry += toEntry;
  remaining -= toEntry;

  const licenseGap = (expected.licenseTotal || 0) - paidLicense;
  const toLicense = Math.min(remaining, licenseGap);
  paidLicense += toLicense;
  remaining -= toLicense;

  const monthlyGap = (expected.monthlyTotal || 0) - paidMonthly;
  const toMonthly = Math.min(remaining, monthlyGap);
  paidMonthly += toMonthly;
  remaining -= toMonthly;

  const balanceEntry = (expected.entryFee || 0) - paidEntry;
  const balanceLicense = (expected.licenseTotal || 0) - paidLicense;
  const balanceMonthly = (expected.monthlyTotal || 0) - paidMonthly;

  return {
    paidEntry,
    paidLicense,
    paidMonthly,
    balanceEntry,
    balanceLicense,
    balanceMonthly,
    overpaid: Math.max(0, remaining),
    excluded: buckets.excluded || 0,
  };
};

export const buildArrearsReason = (allocation) => {
  const parts = [];

  if (allocation.balanceEntry > 0.5) {
    parts.push(`wpisowe ${allocation.balanceEntry.toFixed(0)} zł`);
  }
  if (allocation.balanceMonthly > 0.5) {
    parts.push(`składki ${allocation.balanceMonthly.toFixed(0)} zł`);
  }
  if (allocation.balanceLicense > 0.5) {
    parts.push(`licencja ${allocation.balanceLicense.toFixed(0)} zł`);
  }

  if (!parts.length) return "";
  return parts.join(", ");
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
  const dueYears = listDueMembershipYears(since, new Date(year, throughMonth - 1, 28)) || [];
  const annualYears = dueYears.filter((dueYear) => dueYear <= year);
  const annualTotal = annualYears.reduce(
    (sum, dueYear) =>
      sum +
      annualMembershipFeeForMemberYear(
        since,
        dueYear,
        new Date(year, throughMonth - 1, 28),
      ),
    0,
  );

  return {
    year,
    throughMonth,
    months,
    annualYears: annualYears.length,
    entryFee,
    annualTotal,
    monthlyTotal: annualTotal,
    total: entryFee + annualTotal,
    unknown: false,
  };
};

export const calculateLifetimeExpectedDues = (member, options = {}) => {
  const asOf = options.asOf instanceof Date ? options.asOf : new Date();
  const since = member.memberSince ? String(member.memberSince).slice(0, 10) : null;
  const months = countLifetimeDueMonths(since, asOf);

  if (months == null) {
    return {
      asOf: asOf.toISOString().slice(0, 10),
      memberSince: since,
      months: null,
      entryFee: 0,
      monthlyTotal: 0,
      licenseYears: 0,
      licenseTotal: 0,
      total: 0,
      unknown: true,
    };
  }

  const entryFee = ENTRY_FEE;
  const dueYears = listDueMembershipYears(since, asOf) || [];
  const annualTotal = calculateAnnualMembershipTotal(since, asOf) || 0;
  const licenseYears = countLicenseYearsDue(member, asOf);
  const licenseTotal = licenseYears * LICENSE_FEE_ANNUAL;

  return {
    asOf: asOf.toISOString().slice(0, 10),
    memberSince: since,
    months,
    annualYears: dueYears.length,
    annualFeeEarly: ANNUAL_FEE_EARLY,
    annualFeeLate: ANNUAL_FEE_LATE,
    entryFee,
    annualTotal,
    monthlyTotal: annualTotal,
    licenseYears,
    licenseTotal,
    total: entryFee + annualTotal + licenseTotal,
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

const resolvePaymentMember = (record, members, lookup, textPatterns) => {
  if (record.pesel) {
    const byPesel = members.find((item) => item.pesel === record.pesel);
    if (byPesel) return byPesel;
  }

  const senderRaw = record.sender || record.name || "";
  const senderName = extractBankPartyName(senderRaw) || record.name || senderRaw;
  const title = record.title || "";
  const paymentText = [senderRaw, senderName, title].filter(Boolean).join(" ");

  const titleMember =
    findMemberInPaymentText(title, members, textPatterns) ||
    matchPaymentToMember(title, members, lookup);

  const senderMember =
    matchPaymentToMember(senderName, members, lookup) ||
    matchPaymentToMember(senderRaw, members, lookup);

  if (titleMember && senderMember && titleMember.id !== senderMember.id) {
    return titleMember;
  }

  if (titleMember || senderMember) {
    return titleMember || senderMember;
  }

  return findMemberInPaymentText(paymentText, members, textPatterns);
};

const indexPaymentsByMember = (paymentRecords = [], members = []) => {
  const lookup = buildRosterNameIndex(members);
  const textPatterns = buildMemberTextPatternIndex(members);
  const byMemberId = new Map();
  let unmatchedCount = 0;

  for (const record of paymentRecords) {
    const member = resolvePaymentMember(record, members, lookup, textPatterns);

    if (!member) {
      unmatchedCount += 1;
      continue;
    }

    const current = byMemberId.get(member.id) || emptyPaymentBuckets();
    const split = splitPaymentAmounts(record);

    current.entry += split.entry;
    current.license += split.license;
    current.membership += split.membership;
    current.unknown += split.unknown;
    current.excluded += split.excluded;
    current.amount += split.entry + split.license + split.membership + split.unknown;

    if (record.name) current.names.add(record.name);
    if (record.title) current.names.add(record.title);
    byMemberId.set(member.id, current);
  }

  return { byMemberId, unmatchedCount };
};

export const reconcileDues = (members = [], paymentRecords = [], options = {}) => {
  const asOf = options.asOf instanceof Date ? options.asOf : new Date();
  const activeMembers = members.filter((member) => member.active !== false);
  const { byMemberId, unmatchedCount } = indexPaymentsByMember(paymentRecords, activeMembers);

  const arrears = [];
  const paid = [];
  const missingFromFile = [];
  const unknownExpectation = [];
  const allMembers = [];

  for (const member of activeMembers) {
    const expected = calculateLifetimeExpectedDues(member, { asOf });
    const payment = byMemberId.get(member.id);
    const paidAmount = payment?.amount || 0;
    const allocation = allocatePaymentToDues(expected, paidAmount, payment || null);
    const balance =
      allocation.balanceEntry + allocation.balanceLicense + allocation.balanceMonthly;
    const arrearsReason = buildArrearsReason(allocation);

    let status = "paid";
    if (expected.unknown) status = "unknown";
    else if (balance > 0.5) status = payment ? "arrears" : "no_payment";
    else if (balance < -0.5 || allocation.overpaid > 0.5) status = "overpaid";

    const row = {
      id: member.id,
      displayName: member.displayName || member.fullName,
      pesel: member.pesel || "",
      memberSince: member.memberSince || "",
      licenseActive: member.licenseActive ?? null,
      expected,
      allocation,
      paidAmount,
      balance,
      arrearsReason,
      status,
      paymentName: payment ? [...payment.names].join(" · ") : null,
    };

    allMembers.push(row);

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
  allMembers.sort((a, b) => {
    const statusOrder = { arrears: 0, no_payment: 1, unknown: 2, overpaid: 3, paid: 4 };
    const byStatus = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (byStatus !== 0) return byStatus;
    return b.balance - a.balance;
  });

  return {
    asOf: asOf.toISOString().slice(0, 10),
    summary: {
      activeMembers: activeMembers.length,
      rowsInFile: paymentRecords.length,
      withArrears: arrears.length,
      paidUp: paid.length,
      missingFromFile: missingFromFile.length,
      unknownExpectation: unknownExpectation.length,
      extraPayments: unmatchedCount,
      totalArrearsPln: Math.round(arrears.reduce((sum, row) => sum + row.balance, 0) * 100) / 100,
      totalExpectedPln: Math.round(
        allMembers.reduce((sum, row) => sum + (row.expected?.total || 0), 0) * 100,
      ) / 100,
      totalPaidPln: Math.round(allMembers.reduce((sum, row) => sum + row.paidAmount, 0) * 100) / 100,
    },
    members: allMembers,
    arrears,
    paid,
    missingFromFile,
    unknownExpectation,
  };
};
