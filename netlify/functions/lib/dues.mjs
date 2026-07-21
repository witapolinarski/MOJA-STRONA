import XLSX from "xlsx";
import {
  ANNUAL_FEE_EARLY,
  ANNUAL_FEE_LATE,
  ENTRY_FEE,
  ENTRY_INSURANCE,
  ENTRY_STANDARD_PAYMENT,
  LICENSE_FEE_ANNUAL,
  MONTHLY_FEE,
  annualMembershipFee,
  annualMembershipFeeForMemberYear,
  buildHouseholdObligationSchedule,
  buildMemberObligationSchedule,
  isDuesExempt,
  listDueMembershipYears,
  listLicenseDueYears,
  membershipAnnualRate,
  membershipAnnualRateForPayment,
  buildExemptFromDuesList,
  buildStruckOffFromClubList,
  summarizeMemberScheduleSlice,
  summarizeObligationSchedule,
} from "./fees.mjs";
import { buildHouseholdGroups } from "./households.mjs";
import { isVoucherPayment, buildVoucherPaymentsReport } from "./vouchers.mjs";
import {
  buildRosterNameIndex,
  buildMemberTextPatternIndex,
  findAllMembersInPaymentText,
  findMemberInPaymentText,
  matchPaymentToMember,
  normalizeText,
} from "./names.mjs";

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
const DATE_HEADER = /data (transakcji|zaksięgowania|zaksiegowania)/i;

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
  const map = { pesel: -1, name: -1, amount: -1, credit: -1, debit: -1, title: -1, type: -1, date: -1, monthColumns: [] };

  headers.forEach((header, index) => {
    const label = String(header || "").trim();
    const lower = label.toLowerCase();
    if (map.pesel < 0 && PESEL_HEADER.test(lower)) map.pesel = index;
    if (map.name < 0 && NAME_HEADER.test(lower)) map.name = index;
    if (map.name < 0 && SENDER_HEADER.test(lower)) map.name = index;
    if (map.title < 0 && TITLE_HEADER.test(lower)) map.title = index;
    if (map.date < 0 && DATE_HEADER.test(lower)) map.date = index;
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

const parsePaymentDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const pickPaymentDate = (row, columns) => {
  if (columns.date < 0) return null;
  return parsePaymentDate(row[columns.date]);
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
      date: pickPaymentDate(row, columns),
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

export const countLicenseYearsDue = (member, asOf = new Date()) => listLicenseDueYears(member, asOf).length;

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
  if (isVoucherPayment(record)) return "voucher";
  if (/wpisow/.test(title)) return "entry";
  if (
    (/licencj/.test(title) && !/(skladk|składk|czlonkostw|członkostw)/.test(title)) ||
    /\bpzss\b/.test(title)
  ) {
    return "license";
  }
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
  if (amount === ENTRY_STANDARD_PAYMENT && /wpisow/.test(normalized)) return ENTRY_INSURANCE;
  if (/wpisow/.test(normalized) && amount >= ENTRY_STANDARD_PAYMENT) {
    const bundles = Math.round(amount / ENTRY_STANDARD_PAYMENT);
    if (bundles > 0 && Math.abs(amount - bundles * ENTRY_STANDARD_PAYMENT) < 0.01) {
      return bundles * ENTRY_INSURANCE;
    }
  }
  if (!/ubezp|ubezpieczen/.test(normalized)) return 0;

  const explicit = normalized.match(/(\d+)\s*zl?\s*ubezp|ubezp[^0-9]*(\d+)/);
  if (explicit) return Math.min(amount, Number(explicit[1] || explicit[2]) || 0);

  if (normalized.includes("wpisowe") && amount > ENTRY_FEE) return Math.max(0, amount - ENTRY_FEE);
  if (amount % 10 === 8 && amount > ENTRY_INSURANCE) return ENTRY_INSURANCE;

  return Math.min(amount, 50);
};

export const splitEntryBundleAmount = (amount) => {
  const insurance =
    amount >= ENTRY_STANDARD_PAYMENT
      ? ENTRY_INSURANCE
      : Math.max(0, Math.min(ENTRY_INSURANCE, amount - ENTRY_FEE));
  const entry = Math.min(ENTRY_FEE, Math.max(0, amount - insurance));
  const membership = Math.max(0, amount - insurance - entry);

  return { entry, license: 0, membership, excluded: insurance, unknown: 0 };
};

const isEntryBundleAmount = (amount, title) => {
  const norm = normalizeText(title || "");
  if (/wpisow/.test(norm)) return true;
  if (amount >= ENTRY_STANDARD_PAYMENT) {
    const remainder = amount - ENTRY_STANDARD_PAYMENT;
    return remainder === 0 || remainder % MONTHLY_FEE === 0;
  }
  if (amount >= ENTRY_FEE && amount <= ENTRY_STANDARD_PAYMENT && !/(skladk|licencj)/.test(norm)) {
    return true;
  }
  return false;
};

const isLikelyFirstEntryPayment = (amount, title) => {
  const norm = normalizeText(title || "");
  if (/licencj/.test(norm) && !/wpisow/.test(norm)) return false;
  if (/impreza|darowizn|faktur|zwrot/.test(norm)) return false;
  return isEntryBundleAmount(amount, title);
};

export const splitPaymentAmounts = (record, options = {}) => {
  const title = record.title || "";
  const normalized = normalizeText(title);
  const amount = record.amount || 0;

  if (classifyPaymentPurpose(record) === "exclude") {
    return { entry: 0, license: 0, membership: 0, excluded: amount, unknown: 0 };
  }

  const hasLicenseOnly =
    /licencj/.test(normalized) &&
    !/wpisow/.test(normalized) &&
    !/(skladk|składk|czlonkostw|członkostw)/.test(normalized);

  if (
    !hasLicenseOnly &&
    (isEntryBundleAmount(amount, title) || (options.isFirstPayment && isLikelyFirstEntryPayment(amount, title)))
  ) {
    return splitEntryBundleAmount(amount);
  }

  const excluded = insuranceDeduction(title, amount);
  let remaining = Math.max(0, amount - excluded);

  const hasLicense = /licencj/.test(normalized);
  const hasMembership = /(skladk|składk|czlonkostw|członkostw|membership|sagittarius|czlonkowsk)/.test(
    normalized,
  );
  const hasEntry = /wpisow/.test(normalized);

  const buckets = { entry: 0, license: 0, membership: 0, excluded, unknown: 0 };

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

const lockMembershipSlotAmount = (slot, paymentDate, options = {}) => {
  if (slot.type !== "membership" || slot.joinYear) return;
  if (slot.rateLocked && slot.amount > 0 && !options.force) return;

  const referenceDate = paymentDate instanceof Date ? paymentDate : new Date(paymentDate || Date.now());
  if (Number.isNaN(referenceDate.getTime())) return;

  const paymentYear = referenceDate.getFullYear();
  const amount =
    options.targetYear === slot.year
      ? membershipAnnualRateForPayment(slot.year, referenceDate)
      : paymentYear < slot.year
        ? 0
        : membershipAnnualRate(slot.year, referenceDate);

  if (amount <= 0) return;

  slot.amount = amount;
  slot.balance = Math.max(0, amount - (slot.paid || 0));
  slot.rateLocked = true;
};

const parseMembershipYearFromTitle = (title) => {
  const norm = normalizeText(title);
  const match =
    norm.match(/skladk(?:a|i|e)?\s+za\s+(\d{4})/) ||
    norm.match(/skladk(?:a|i|e)?\s+(\d{4})/) ||
    norm.match(/(?:oplat[ao]|oplata)\s+za\s+(\d{4})/);
  return match ? Number(match[1]) : null;
};

const parseMembershipThroughYear = (title) => {
  const norm = normalizeText(title);
  const match = norm.match(/skladk(?:a|i|e)?.*?\bdo\s*(\d{4})/);
  return match ? Number(match[1]) : null;
};

const applyAmountToSlot = (slot, amount, counters) => {
  if (!slot || amount <= 0 || slot.balance <= 0) return amount;

  const applied = Math.min(amount, slot.balance);
  slot.paid += applied;
  slot.balance -= applied;

  if (slot.type === "entry") counters.paidEntry += applied;
  else if (slot.type === "membership") counters.paidMonthly += applied;
  else if (slot.type === "license") counters.paidLicense += applied;

  return amount - applied;
};

const applyPaymentToMembershipYear = (schedule, year, amount, paymentDate, counters) => {
  const slot = schedule.find((item) => item.type === "membership" && item.year === year);
  if (!slot) return amount;

  lockMembershipSlotAmount(slot, paymentDate, { targetYear: year, force: true });
  return applyAmountToSlot(slot, amount, counters);
};

const applyPaymentThroughMembershipYear = (schedule, throughYear, amount, paymentDate, counters) => {
  let remaining = amount;

  for (const slot of schedule) {
    if (remaining <= 0) break;
    if (slot.type !== "membership") continue;
    if (slot.year != null && slot.year > throughYear) break;

    lockMembershipSlotAmount(slot, paymentDate, {
      targetYear: slot.year ?? undefined,
      force: slot.year != null,
    });
    remaining = applyAmountToSlot(slot, remaining, counters);
  }

  return remaining;
};

const applyPaymentToLicenses = (schedule, amount, counters) => {
  let remaining = amount;

  for (const slot of schedule) {
    if (remaining <= 0) break;
    if (slot.type !== "license") continue;
    remaining = applyAmountToSlot(slot, remaining, counters);
  }

  return remaining;
};

const applyPaymentChronologically = (schedule, amount, paymentDate, counters) => {
  let remaining = amount;

  for (const slot of schedule) {
    if (remaining <= 0) break;

    lockMembershipSlotAmount(slot, paymentDate);
    remaining = applyAmountToSlot(slot, remaining, counters);
  }

  return remaining;
};

const allocateSinglePayment = (schedule, record, counters) => {
  let amount = record.amount || 0;
  const insurance = insuranceDeduction(record.title, amount);
  if (insurance > 0) {
    counters.excluded += insurance;
    amount -= insurance;
  }
  if (!amount) return;

  counters.totalPaid += amount;

  const purpose = classifyPaymentPurpose(record);
  const membershipYear = parseMembershipYearFromTitle(record.title);
  const throughYear = parseMembershipThroughYear(record.title);
  let remaining = amount;

  if (membershipYear) {
    remaining = applyPaymentToMembershipYear(schedule, membershipYear, remaining, record.date, counters);
  } else if (throughYear) {
    remaining = applyPaymentThroughMembershipYear(schedule, throughYear, remaining, record.date, counters);
  } else if (purpose === "license") {
    remaining = applyPaymentToLicenses(schedule, remaining, counters);
  } else if (purpose === "entry") {
    const entrySlot = schedule.find((item) => item.type === "entry");
    remaining = applyAmountToSlot(entrySlot, remaining, counters);
    remaining = applyPaymentChronologically(schedule, remaining, record.date, counters);
  } else if (purpose === "membership") {
    remaining = applyPaymentChronologically(schedule, remaining, record.date, counters);
  } else {
    remaining = applyPaymentChronologically(schedule, remaining, record.date, counters);
  }

  counters.overpaid += remaining;
};

const finalizeMembershipSlotAmounts = (schedule = [], asOf = new Date()) => {
  for (const slot of schedule) {
    if (slot.type !== "membership" || slot.joinYear) continue;

    if (slot.rateLocked && slot.amount > 0) {
      slot.balance = Math.max(0, slot.amount - (slot.paid || 0));
      continue;
    }

    const amount = membershipAnnualRate(slot.year, asOf);
    if (amount <= 0) continue;

    slot.amount = amount;
    slot.balance = Math.max(0, amount - (slot.paid || 0));
    slot.rateLocked = true;
  }
};

export const allocatePaymentsToSchedule = (obligations = [], paymentRecords = [], options = {}) => {
  const asOf = options.asOf instanceof Date ? options.asOf : new Date();
  const schedule = (obligations || []).map((item) => ({
    ...item,
    paid: 0,
    balance: item.amount,
    rateLocked: item.joinYear === true,
  }));

  const counters = {
    paidEntry: 0,
    paidLicense: 0,
    paidMonthly: 0,
    excluded: 0,
    overpaid: 0,
    totalPaid: 0,
  };

  const sorted = [...paymentRecords].sort(comparePaymentDates);

  for (const record of sorted) {
    if (classifyPaymentPurpose(record) === "exclude" || classifyPaymentPurpose(record) === "voucher") {
      counters.excluded += record.amount || 0;
      continue;
    }

    allocateSinglePayment(schedule, record, counters);
  }

  finalizeMembershipSlotAmounts(schedule, asOf);

  const expectedEntry = schedule
    .filter((item) => item.type === "entry")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const expectedMonthly = schedule
    .filter((item) => item.type === "membership")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const expectedLicense = schedule
    .filter((item) => item.type === "license")
    .reduce((sum, item) => sum + (item.amount || 0), 0);

  return {
    paidEntry: counters.paidEntry,
    paidLicense: counters.paidLicense,
    paidMonthly: counters.paidMonthly,
    balanceEntry: Math.max(0, expectedEntry - counters.paidEntry),
    balanceLicense: Math.max(0, expectedLicense - counters.paidLicense),
    balanceMonthly: Math.max(0, expectedMonthly - counters.paidMonthly),
    overpaid: counters.overpaid,
    excluded: counters.excluded,
    totalPaid: counters.totalPaid,
    schedule,
  };
};

export const allocatePaymentToDues = (expected, paidAmount = 0, paymentRecords = null) => {
  if (paymentRecords?.length) {
    return allocatePaymentsToSchedule(expected.schedule || [], paymentRecords);
  }

  let remaining = paidAmount;

  const paidEntry = Math.min(remaining, expected.entryFee || 0);
  remaining -= paidEntry;

  const paidMonthly = Math.min(remaining, expected.monthlyTotal || 0);
  remaining -= paidMonthly;

  const paidLicense = Math.min(remaining, expected.licenseTotal || 0);
  remaining -= paidLicense;

  const balanceEntry = (expected.entryFee || 0) - paidEntry;
  const balanceMonthly = (expected.monthlyTotal || 0) - paidMonthly;
  const balanceLicense = (expected.licenseTotal || 0) - paidLicense;

  return {
    paidEntry,
    paidLicense,
    paidMonthly,
    balanceEntry,
    balanceLicense,
    balanceMonthly,
    overpaid: Math.max(0, remaining),
    totalPaid: paidAmount,
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
  const schedule = buildMemberObligationSchedule(member, asOf);

  if (months == null || schedule == null) {
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

  const summary = summarizeObligationSchedule(schedule);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    memberSince: since,
    licenseActive: member.licenseActive ?? null,
    months,
    annualYears: summary.annualYears,
    annualFeeEarly: ANNUAL_FEE_EARLY,
    annualFeeLate: ANNUAL_FEE_LATE,
    entryFee: summary.entryFee,
    annualTotal: summary.annualTotal,
    monthlyTotal: summary.annualTotal,
    licenseYears: summary.licenseYears,
    licenseTotal: summary.licenseTotal,
    total: summary.total,
    unknown: false,
    schedule,
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

const comparePaymentDates = (left, right) => {
  const leftTime = left?.date instanceof Date ? left.date.getTime() : 0;
  const rightTime = right?.date instanceof Date ? right.date.getTime() : 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return (left?.amount || 0) - (right?.amount || 0);
};

const matchHouseholdBySender = (record, households, textPatterns) => {
  const senderRaw = record.sender || record.name || "";
  const senderName = extractBankPartyName(senderRaw) || senderRaw;
  const norm = normalizeText(senderName);
  const title = record.title || "";

  if (!norm) return null;

  for (const household of households) {
    const surname = normalizeText(household.members[0]?.lastName);
    if (!surname || !norm.includes(surname)) continue;

    const specificInTitle = findMemberInPaymentText(title, household.members, textPatterns);
    if (specificInTitle) continue;

    return household;
  }

  return null;
};

const assignPaymentTarget = (record, members, lookup, textPatterns, householdByMemberId, households) => {
  const title = record.title || "";
  const titleMatches = findAllMembersInPaymentText(title, members, textPatterns);

  if (titleMatches.length === 1) {
    return { kind: "member", memberId: titleMatches[0].id };
  }

  if (titleMatches.length > 1) {
    const householdIds = new Set(
      titleMatches.map((member) => householdByMemberId.get(member.id)?.id).filter(Boolean),
    );
    if (householdIds.size === 1) {
      return { kind: "household", householdId: [...householdIds][0] };
    }
  }

  const member = resolvePaymentMember(record, members, lookup, textPatterns);
  if (!member) {
    const household = matchHouseholdBySender(record, households, textPatterns);
    if (household) return { kind: "household", householdId: household.id };
    return { kind: "unmatched" };
  }

  const household = householdByMemberId.get(member.id);
  if (!household) return { kind: "member", memberId: member.id };

  const specific = findMemberInPaymentText(title, household.members, textPatterns);
  if (specific) return { kind: "member", memberId: specific.id };

  return { kind: "household", householdId: household.id };
};

const collectHouseholdPayments = (household, byHouseholdId, byMemberId) => {
  const records = [...(byHouseholdId.get(household.id)?.records || [])];

  for (const member of household.members) {
    const bucket = byMemberId.get(member.id);
    if (bucket?.records?.length) records.push(...bucket.records);
  }

  const unique = new Map();
  for (const record of records) {
    const key = `${record.date instanceof Date ? record.date.getTime() : ""}|${record.amount}|${record.title}|${record.name}|${record.sender}`;
    unique.set(key, record);
  }

  return [...unique.values()].sort(comparePaymentDates);
};

const indexPaymentsByMember = (
  paymentRecords = [],
  members = [],
  householdByMemberId = new Map(),
  households = [],
) => {
  const lookup = buildRosterNameIndex(members);
  const textPatterns = buildMemberTextPatternIndex(members);
  const byMemberId = new Map();
  const byHouseholdId = new Map();
  let unmatchedCount = 0;

  for (const record of paymentRecords) {
    if (isVoucherPayment(record)) continue;

    const target = assignPaymentTarget(
      record,
      members,
      lookup,
      textPatterns,
      householdByMemberId,
      households,
    );

    if (target.kind === "unmatched") {
      unmatchedCount += 1;
      continue;
    }

    if (target.kind === "household") {
      const bucket = byHouseholdId.get(target.householdId) || { records: [], names: new Set() };
      bucket.records.push(record);
      if (record.name) bucket.names.add(record.name);
      if (record.title) bucket.names.add(record.title);
      if (record.sender) bucket.names.add(record.sender);
      byHouseholdId.set(target.householdId, bucket);
      continue;
    }

    const bucket = byMemberId.get(target.memberId) || { records: [], names: new Set() };
    bucket.records.push(record);
    if (record.name) bucket.names.add(record.name);
    if (record.title) bucket.names.add(record.title);
    if (record.sender) bucket.names.add(record.sender);
    byMemberId.set(target.memberId, bucket);
  }

  for (const bucket of byMemberId.values()) {
    bucket.records.sort(comparePaymentDates);
  }

  for (const bucket of byHouseholdId.values()) {
    bucket.records.sort(comparePaymentDates);
  }

  return { byMemberId, byHouseholdId, unmatchedCount };
};

const buildMemberDuesRow = (member, expected, memberSlice, allocation, paymentNames = [], options = {}) => {
  const rowAllocation = {
    paidEntry: memberSlice.paidEntry,
    paidLicense: memberSlice.paidLicense,
    paidMonthly: memberSlice.paidMonthly,
    balanceEntry: memberSlice.balanceEntry,
    balanceLicense: memberSlice.balanceLicense,
    balanceMonthly: memberSlice.balanceMonthly,
    overpaid: options.householdMember ? 0 : allocation.overpaid || 0,
    excluded: options.householdMember ? 0 : allocation.excluded || 0,
    totalPaid: memberSlice.totalPaid,
  };
  const balance = rowAllocation.balanceEntry + rowAllocation.balanceLicense + rowAllocation.balanceMonthly;
  const arrearsReason = buildArrearsReason(rowAllocation);
  const hasPayment = memberSlice.totalPaid > 0 || paymentNames.length > 0;

  let status = "paid";
  if (expected.unknown) status = "unknown";
  else if (balance > 0.5) status = hasPayment ? "arrears" : "no_payment";
  else if (balance < -0.5 || rowAllocation.overpaid > 0.5) status = "overpaid";

  return {
    id: member.id,
    displayName: member.displayName || member.fullName,
    pesel: member.pesel || "",
    memberSince: member.memberSince || "",
    licenseActive: member.licenseActive ?? null,
    expected,
    allocation: rowAllocation,
    paidAmount: memberSlice.totalPaid,
    balance,
    arrearsReason,
    status,
    paymentName: paymentNames.length ? paymentNames.join(" · ") : null,
    householdKey: member.householdKey || null,
  };
};

export const reconcileDues = (members = [], paymentRecords = [], options = {}) => {
  const asOf = options.asOf instanceof Date ? options.asOf : new Date();
  const activeMembers = members.filter((member) => member.active !== false);
  const duesMembers = activeMembers.filter((member) => !isDuesExempt(member));
  const { households, householdByMemberId } = buildHouseholdGroups(duesMembers);
  const { byMemberId, byHouseholdId, unmatchedCount } = indexPaymentsByMember(
    paymentRecords,
    activeMembers,
    householdByMemberId,
    households,
  );

  const arrears = [];
  const paid = [];
  const missingFromFile = [];
  const unknownExpectation = [];
  const allMembers = [];
  const processedHouseholds = new Set();

  for (const member of duesMembers) {
    const household = householdByMemberId.get(member.id);

    if (household) {
      if (processedHouseholds.has(household.id)) continue;
      processedHouseholds.add(household.id);

      const schedule = buildHouseholdObligationSchedule(household.members, asOf);
      const records = collectHouseholdPayments(household, byHouseholdId, byMemberId);
      const allocation = allocatePaymentsToSchedule(schedule || [], records, { asOf });
      const paymentNames = [
        ...(byHouseholdId.get(household.id)?.names || []),
        ...household.members.flatMap((item) => [...(byMemberId.get(item.id)?.names || [])]),
      ];

      for (const householdMember of household.members) {
        const expected = calculateLifetimeExpectedDues(householdMember, { asOf });
        const memberSlice = summarizeMemberScheduleSlice(
          allocation.schedule,
          householdMember.id,
          expected,
        );
        const row = buildMemberDuesRow(
          { ...householdMember, householdKey: household.key },
          expected,
          memberSlice,
          allocation,
          [...new Set(paymentNames)],
          { householdMember: true },
        );

        allMembers.push(row);

        if (expected.unknown) {
          unknownExpectation.push(row);
          continue;
        }

        if (!row.paidAmount) {
          missingFromFile.push(row);
          if (row.balance > 0.5) arrears.push(row);
          continue;
        }

        if (row.balance > 0.5) arrears.push(row);
        else paid.push(row);
      }

      continue;
    }

    const expected = calculateLifetimeExpectedDues(member, { asOf });
    const payment = byMemberId.get(member.id);
    const allocation = allocatePaymentsToSchedule(expected.schedule || [], payment?.records || [], { asOf });
    const memberSlice = summarizeMemberScheduleSlice(allocation.schedule, member.id, expected);
    const row = buildMemberDuesRow(
      member,
      expected,
      memberSlice,
      allocation,
      payment ? [...payment.names] : [],
    );

    allMembers.push(row);

    if (expected.unknown) {
      unknownExpectation.push(row);
      continue;
    }

    if (!payment) {
      missingFromFile.push(row);
      if (row.balance > 0.5) arrears.push(row);
      continue;
    }

    if (row.balance > 0.5) arrears.push(row);
    else paid.push(row);
  }

  arrears.sort((a, b) => b.balance - a.balance);
  allMembers.sort((a, b) => {
    const statusOrder = { arrears: 0, no_payment: 1, unknown: 2, overpaid: 3, paid: 4 };
    const byStatus = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (byStatus !== 0) return byStatus;
    return b.balance - a.balance;
  });

  const exemptFromDues = buildExemptFromDuesList(activeMembers);
  const struckOffFromClub = buildStruckOffFromClubList(options.removedMembers || []);
  const voucherReport = buildVoucherPaymentsReport(paymentRecords, activeMembers);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    summary: {
      activeMembers: duesMembers.length,
      exemptMembers: exemptFromDues.length,
      struckOffMembers: struckOffFromClub.length,
      rowsInFile: paymentRecords.length,
      withArrears: arrears.length,
      paidUp: paid.length,
      missingFromFile: missingFromFile.length,
      unknownExpectation: unknownExpectation.length,
      extraPayments: unmatchedCount,
      voucherPayments: voucherReport.summary.paymentCount,
      voucherPayers: voucherReport.summary.payerCount,
      voucherTotalPln: voucherReport.summary.totalPln,
      totalArrearsPln: Math.round(arrears.reduce((sum, row) => sum + row.balance, 0) * 100) / 100,
      totalExpectedPln: Math.round(
        allMembers.reduce((sum, row) => sum + (row.expected?.total || 0), 0) * 100,
      ) / 100,
      totalPaidPln: Math.round(allMembers.reduce((sum, row) => sum + row.paidAmount, 0) * 100) / 100,
    },
    members: allMembers,
    exemptFromDues,
    struckOffFromClub,
    voucherReport,
    arrears,
    paid,
    missingFromFile,
    unknownExpectation,
  };
};
