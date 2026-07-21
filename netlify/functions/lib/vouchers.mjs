import {
  buildMemberTextPatternIndex,
  buildRosterNameIndex,
  findMemberInPaymentText,
  matchPaymentToMember,
  normalizeText,
} from "./names.mjs";

export const VOUCHER_TIERS_PLN = [300, 400, 500, 600, 800];

const isAccountNumberPart = (value) => {
  const compact = String(value || "").replace(/\s/g, "");
  if (!compact) return false;
  if (/^\d[\d\s]+$/.test(compact)) return true;
  if (/^PL\d{10,}$/i.test(compact)) return true;
  return false;
};

const extractBankPartyName = (value) => {
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

const formatIsoDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return "";
};

const comparePaymentDates = (left, right) => {
  const leftTime = left?.date instanceof Date ? left.date.getTime() : 0;
  const rightTime = right?.date instanceof Date ? right.date.getTime() : 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return (right?.amount || 0) - (left?.amount || 0);
};

export const detectVoucherPayment = (record = {}) => {
  const title = normalizeText(record.title || "");
  const sender = normalizeText(record.sender || record.name || "");
  const combined = `${title} ${sender}`.trim();
  const amount = Number(record.amount) || 0;
  const reasons = [];

  if (/bon|voucher|vouchery|podarunkow/.test(combined)) {
    reasons.push("bon/voucher w tytule lub nadawcy");
  }
  if (/stripe/.test(combined)) {
    reasons.push("płatność Stripe (strzelam.com)");
  }
  if (/strzelam/.test(combined)) {
    reasons.push("odniesienie do strzelam.com");
  }
  if (VOUCHER_TIERS_PLN.includes(amount) && /stripe|bon|voucher|strzelam|podarunkow/.test(combined)) {
    reasons.push(`kwota bonu ${amount} zł`);
  }

  if (!reasons.length) return null;

  return {
    reasons,
    tierPln: VOUCHER_TIERS_PLN.includes(amount) ? amount : null,
  };
};

export const isVoucherPayment = (record = {}) => Boolean(detectVoucherPayment(record));

const extractRecipientHint = (title = "") => {
  const raw = String(title || "");
  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) return email[0];

  const forWhom = raw.match(/(?:dla|obdarowany|obdarowan[aey]|recipient)[:\s]+([^/;|]+)/i);
  if (forWhom?.[1]) return forWhom[1].trim().slice(0, 120);

  return "";
};

const resolveVoucherMember = (record, members, lookup, textPatterns) => {
  const title = record.title || "";
  const senderRaw = record.sender || record.name || "";
  const senderName = extractBankPartyName(senderRaw) || record.name || senderRaw;

  const titleMember =
    findMemberInPaymentText(title, members, textPatterns) ||
    matchPaymentToMember(title, members, lookup);

  if (titleMember) return titleMember;

  return (
    matchPaymentToMember(senderName, members, lookup) ||
    matchPaymentToMember(senderRaw, members, lookup) ||
    findMemberInPaymentText([senderRaw, senderName, title].filter(Boolean).join(" "), members, textPatterns)
  );
};

export const buildVoucherPaymentsReport = (paymentRecords = [], members = []) => {
  const activeMembers = (members || []).filter((member) => member.active !== false);
  const lookup = buildRosterNameIndex(activeMembers);
  const textPatterns = buildMemberTextPatternIndex(activeMembers);

  const payments = [];

  for (const record of paymentRecords || []) {
    const detection = detectVoucherPayment(record);
    if (!detection) continue;

    const payerName = extractBankPartyName(record.sender || record.name || "") || record.name || "";
    const matchedMember = resolveVoucherMember(record, activeMembers, lookup, textPatterns);

    payments.push({
      date: formatIsoDate(record.date),
      amount: record.amount || 0,
      title: record.title || "",
      sender: record.sender || record.name || "",
      payerName,
      recipientHint: extractRecipientHint(record.title),
      tierPln: detection.tierPln,
      matchReasons: detection.reasons,
      matchedMember: matchedMember
        ? {
            id: matchedMember.id,
            displayName: matchedMember.displayName || matchedMember.fullName,
            pesel: matchedMember.pesel || "",
            memberSince: matchedMember.memberSince || "",
          }
        : null,
    });
  }

  payments.sort(comparePaymentDates);

  const byPayer = new Map();

  for (const payment of payments) {
    const key = normalizeText(payment.payerName || payment.sender || "nieznany");
    const bucket = byPayer.get(key) || {
      payerName: payment.payerName || payment.sender || "Nieznany płatnik",
      payments: [],
      totalPln: 0,
      matchedMembers: new Map(),
      recipientHints: new Set(),
      tiers: new Set(),
    };

    bucket.payments.push(payment);
    bucket.totalPln += payment.amount || 0;
    if (payment.matchedMember?.displayName) {
      bucket.matchedMembers.set(payment.matchedMember.id, payment.matchedMember.displayName);
    }
    if (payment.recipientHint) bucket.recipientHints.add(payment.recipientHint);
    if (payment.tierPln) bucket.tiers.add(payment.tierPln);
    byPayer.set(key, bucket);
  }

  const people = [...byPayer.values()]
    .map((bucket) => ({
      payerName: bucket.payerName,
      paymentCount: bucket.payments.length,
      totalPln: Math.round(bucket.totalPln * 100) / 100,
      matchedMembers: [...bucket.matchedMembers.values()],
      recipientHints: [...bucket.recipientHints],
      tiers: [...bucket.tiers].sort((a, b) => a - b),
      payments: bucket.payments,
    }))
    .sort((left, right) => right.totalPln - left.totalPln || right.paymentCount - left.paymentCount);

  return {
    source: "strzelam.com — bony podarunkowe (Stripe)",
    tiersPln: VOUCHER_TIERS_PLN,
    summary: {
      paymentCount: payments.length,
      payerCount: people.length,
      totalPln: Math.round(payments.reduce((sum, row) => sum + (row.amount || 0), 0) * 100) / 100,
      matchedToRoster: payments.filter((row) => row.matchedMember).length,
      unmatched: payments.filter((row) => !row.matchedMember).length,
    },
    people,
    payments,
  };
};
