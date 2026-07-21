export const ENTRY_FEE = 350;
export const ENTRY_INSURANCE = 8;
export const ENTRY_STANDARD_PAYMENT = ENTRY_FEE + ENTRY_INSURANCE;
export const MONTHLY_FEE = 30;
export const LICENSE_FEE_ANNUAL = 100;

export const ANNUAL_FEE_EARLY = 300;
export const ANNUAL_FEE_LATE = 360;

export const DUES_EXEMPT_PESELS = new Set([
  "80073102937", // PIETRUSZKA Marek (Kostuś) — VIP, poza zestawieniem składek
]);

export const isDuesExempt = (member) => {
  const pesel = String(member?.pesel || "").replace(/\D/g, "");
  return DUES_EXEMPT_PESELS.has(pesel);
};

const parseMemberSince = (memberSince) => {
  if (!memberSince) return null;
  const since = new Date(`${String(memberSince).slice(0, 10)}T12:00:00`);
  return Number.isNaN(since.getTime()) ? null : since;
};

export const getFirstMembershipFeeYear = (memberSince) => {
  const since = parseMemberSince(memberSince);
  if (!since) return null;

  const joinYear = since.getFullYear();
  const joinMonth = since.getMonth() + 1;

  if (joinMonth === 12) return joinYear + 1;

  const firstFeeMonth = joinMonth + 1;
  if (firstFeeMonth > 12) return joinYear + 1;

  return joinYear;
};

export const listDueMembershipYears = (memberSince, asOf = new Date()) => {
  const startYear = getFirstMembershipFeeYear(memberSince);
  if (startYear == null) return null;

  const endYear = asOf.getFullYear();
  if (startYear > endYear) return [];

  const years = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
};

export const annualMembershipFee = (year, asOf = new Date()) => {
  const asOfYear = asOf.getFullYear();
  const asOfMonth = asOf.getMonth() + 1;

  if (year > asOfYear) return 0;
  if (year < asOfYear) return ANNUAL_FEE_LATE;
  return asOfMonth === 1 ? ANNUAL_FEE_EARLY : ANNUAL_FEE_LATE;
};

export const annualMembershipFeeForMemberYear = (memberSince, year, asOf = new Date()) => {
  const since = parseMemberSince(memberSince);
  if (!since) return 0;

  const joinYear = since.getFullYear();
  const joinMonth = since.getMonth() + 1;
  const rate = annualMembershipFee(year, asOf);
  if (!rate) return 0;

  if (year !== joinYear) return rate;
  if (joinMonth === 12) return 0;

  const firstFeeMonth = joinMonth + 1;
  const monthsInJoinYear = 12 - firstFeeMonth + 1;
  return Math.round((rate * monthsInJoinYear) / 12);
};

export const calculateAnnualMembershipTotal = (memberSince, asOf = new Date()) => {
  const years = listDueMembershipYears(memberSince, asOf);
  if (years == null) return null;
  return years.reduce((sum, year) => sum + annualMembershipFeeForMemberYear(memberSince, year, asOf), 0);
};

export const countFeeMonths = (acceptanceDate) => {
  const date = acceptanceDate instanceof Date ? acceptanceDate : new Date(acceptanceDate);
  const nextMonthIndex = date.getMonth() + 1;
  if (nextMonthIndex > 11) return 0;
  return 12 - nextMonthIndex;
};

export const calculateMembershipFees = (acceptanceDateInput) => {
  const acceptanceDate = acceptanceDateInput
    ? new Date(`${acceptanceDateInput}T12:00:00`)
    : new Date();
  const asOf = new Date();
  const memberSince = acceptanceDate.toISOString().slice(0, 10);
  const annualTotal = calculateAnnualMembershipTotal(memberSince, asOf) || 0;
  const total = ENTRY_FEE + annualTotal;

  return {
    entryFee: ENTRY_FEE,
    annualFeeEarly: ANNUAL_FEE_EARLY,
    annualFeeLate: ANNUAL_FEE_LATE,
    annualTotal,
    total,
    totalGrosze: Math.round(total * 100),
    acceptanceDate: memberSince,
  };
};
