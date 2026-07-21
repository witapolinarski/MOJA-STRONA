import { normalizeText } from "./names.mjs";
import { parseLicenseValidYear } from "./license-data.mjs";

export const ENTRY_FEE = 350;
export const ENTRY_INSURANCE = 8;
export const ENTRY_STANDARD_PAYMENT = ENTRY_FEE + ENTRY_INSURANCE;
export const MONTHLY_FEE = 30;
export const LICENSE_FEE_ANNUAL = 100;

export const ANNUAL_FEE_EARLY = 300;
export const ANNUAL_FEE_LATE = 360;

export const DUES_EXEMPT_MEMBERS = [
  { pesel: "80073102937", label: "PIETRUSZKA Marek" },
  { pesel: "74030712718", label: "KOSTUŚ Tomasz" },
];

export const DUES_EXEMPT_PESELS = new Set(DUES_EXEMPT_MEMBERS.map((item) => item.pesel));

export const isInactiveInPzss = (member) => member?.active === false || Boolean(member?.memberUntil);

export const buildStruckOffFromClubList = (removedMembers = []) =>
  (removedMembers || [])
    .map((member) => ({
      id: member.id,
      displayName: member.displayName || member.fullName,
      pesel: member.pesel || "",
      memberSince: member.memberSince || "",
      memberUntil: member.removedAt?.slice(0, 10) || member.memberUntil || "",
      reason: member.removedReason || "Brak na liście SOZ (Club/Persons/List)",
      missingFromRoster: false,
    }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "pl"));

export const isDuesExempt = (member) => {
  const pesel = String(member?.pesel || "").replace(/\D/g, "");
  return DUES_EXEMPT_PESELS.has(pesel);
};

export const buildExemptFromDuesList = (members = []) => {
  const active = (members || []).filter((member) => member.active !== false);
  const byPesel = new Map(
    active.filter(isDuesExempt).map((member) => [String(member.pesel || "").replace(/\D/g, ""), member]),
  );

  return DUES_EXEMPT_MEMBERS.map((item) => {
    const member = byPesel.get(item.pesel);
    if (!member) {
      return {
        pesel: item.pesel,
        displayName: item.label,
        memberSince: "",
        missingFromRoster: true,
      };
    }

    return {
      id: member.id,
      displayName: member.displayName || member.fullName || item.label,
      pesel: member.pesel || item.pesel,
      memberSince: member.memberSince || "",
      licenseActive: member.licenseActive ?? null,
      missingFromRoster: false,
    };
  });
};

const parseMemberSince = (memberSince) => {
  if (!memberSince) return null;
  const since = new Date(`${String(memberSince).slice(0, 10)}T12:00:00`);
  return Number.isNaN(since.getTime()) ? null : since;
};

export const getJoinYear = (memberSince) => {
  const since = parseMemberSince(memberSince);
  return since ? since.getFullYear() : null;
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

export const joinYearMembershipFee = (memberSince) => {
  const since = parseMemberSince(memberSince);
  if (!since) return 0;

  const joinMonth = since.getMonth() + 1;
  if (joinMonth === 12) return 0;

  const monthsInJoinYear = 12 - joinMonth;
  return monthsInJoinYear * MONTHLY_FEE;
};

export const membershipAnnualRate = (year, referenceDate = new Date()) => {
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;

  if (year > refYear) return 0;
  if (year < refYear) return ANNUAL_FEE_LATE;
  return refMonth === 1 ? ANNUAL_FEE_EARLY : ANNUAL_FEE_LATE;
};

export const membershipAnnualRateForPayment = (targetYear, paymentDate = new Date()) => {
  const ref = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
  if (Number.isNaN(ref.getTime())) return membershipAnnualRate(targetYear, paymentDate);

  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;

  if (targetYear === refYear + 1 && refMonth === 12) return ANNUAL_FEE_EARLY;
  if (targetYear > refYear) return ANNUAL_FEE_EARLY;
  if (targetYear < refYear) return ANNUAL_FEE_LATE;
  return refMonth === 1 ? ANNUAL_FEE_EARLY : ANNUAL_FEE_LATE;
};

export const annualMembershipFee = (year, asOf = new Date()) => membershipAnnualRate(year, asOf);

export const annualMembershipFeeForMemberYear = (memberSince, year, asOf = new Date()) => {
  const since = parseMemberSince(memberSince);
  if (!since) return 0;

  const joinYear = since.getFullYear();
  if (year === joinYear) return joinYearMembershipFee(memberSince);

  return membershipAnnualRate(year, asOf);
};

export const memberHasLicenseHistory = (member) =>
  member?.licenseActive === true ||
  member?.licenseActive === false ||
  member?.licenseStatus ||
  member?.licenseValidYear ||
  member?.licenseLastValidYear ||
  member?.licenseValidUntil ||
  member?.licenseIssuedAt;

export const listLicenseDueYears = (member, asOf = new Date()) => {
  const since = member?.memberSince ? String(member.memberSince).slice(0, 10) : null;
  if (!since || !memberHasLicenseHistory(member)) return [];

  const membershipYears = listDueMembershipYears(since, asOf) || [];
  if (!membershipYears.length) return [];

  const joinYear = Number(since.slice(0, 4));
  let firstLicenseYear = joinYear;
  if (member.licenseIssuedAt) {
    firstLicenseYear = Math.max(joinYear, Number(String(member.licenseIssuedAt).slice(0, 4)) || joinYear);
  }

  let lastLicenseYear = null;
  if (member.licenseActive === true) {
    lastLicenseYear =
      Number(member.licenseValidYear) ||
      parseLicenseValidYear(member.licenseValidUntil) ||
      asOf.getFullYear();
  } else if (member.licenseLastValidYear) {
    lastLicenseYear = Number(member.licenseLastValidYear);
  } else if (member.licenseValidUntil) {
    lastLicenseYear = parseLicenseValidYear(member.licenseValidUntil);
  }

  if (!lastLicenseYear) return [];

  return membershipYears.filter((year) => year >= firstLicenseYear && year <= lastLicenseYear);
};

export const buildMemberObligationSchedule = (member, asOf = new Date()) => {
  const since = member?.memberSince ? String(member.memberSince).slice(0, 10) : null;
  if (!since) return null;

  const dueYears = listDueMembershipYears(since, asOf);
  if (dueYears == null) return null;

  const joinYear = getJoinYear(since);
  const licenseYears = new Set(listLicenseDueYears(member, asOf));
  const obligations = [
    {
      type: "entry",
      year: null,
      amount: ENTRY_FEE,
      label: "wpisowe",
      memberId: member.id || null,
    },
  ];

  for (const year of dueYears) {
    const isJoinYear = year === joinYear;
    const membershipAmount = isJoinYear
      ? joinYearMembershipFee(since)
      : membershipAnnualRate(year, asOf);

    if (membershipAmount > 0) {
      obligations.push({
        type: "membership",
        year,
        amount: membershipAmount,
        label: isJoinYear ? `składka ${year} (${membershipAmount / MONTHLY_FEE} mies.)` : `składka ${year}`,
        memberId: member.id || null,
        joinYear: isJoinYear,
      });
    }

    if (licenseYears.has(year)) {
      obligations.push({
        type: "license",
        year,
        amount: LICENSE_FEE_ANNUAL,
        label: `licencja ${year}`,
        memberId: member.id || null,
      });
    }
  }

  return obligations;
};

export const buildHouseholdObligationSchedule = (members = [], asOf = new Date()) => {
  const sorted = [...members].sort((left, right) =>
    String(left.firstName || left.displayName).localeCompare(String(right.firstName || right.displayName), "pl"),
  );

  const obligations = [];
  for (const member of sorted) {
    const memberSchedule = buildMemberObligationSchedule(member, asOf) || [];
    obligations.push(...memberSchedule);
  }

  return obligations.length ? obligations : null;
};

export const summarizeObligationSchedule = (obligations = []) => {
  const entryFee = obligations
    .filter((item) => item.type === "entry")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const annualTotal = obligations
    .filter((item) => item.type === "membership")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const licenseTotal = obligations
    .filter((item) => item.type === "license")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  const licenseYears = obligations.filter((item) => item.type === "license").length;
  const annualYears = obligations.filter((item) => item.type === "membership").length;

  return {
    entryFee,
    annualTotal,
    monthlyTotal: annualTotal,
    licenseTotal,
    licenseYears,
    annualYears,
    total: entryFee + annualTotal + licenseTotal,
  };
};

export const summarizeMemberScheduleSlice = (schedule = [], memberId = null, expected = null) => {
  const slice = memberId ? schedule.filter((item) => item.memberId === memberId) : schedule;
  const summary = expected
    ? {
        entryFee: expected.entryFee || 0,
        annualTotal: expected.monthlyTotal || 0,
        licenseTotal: expected.licenseTotal || 0,
        total: expected.total || 0,
      }
    : summarizeObligationSchedule(slice);

  let paidEntry = 0;
  let paidMonthly = 0;
  let paidLicense = 0;

  for (const item of slice) {
    const paid = item.paid || 0;
    if (item.type === "entry") paidEntry += paid;
    else if (item.type === "membership") paidMonthly += paid;
    else if (item.type === "license") paidLicense += paid;
  }

  return {
    ...summary,
    paidEntry,
    paidMonthly,
    paidLicense,
    balanceEntry: Math.max(0, summary.entryFee - paidEntry),
    balanceMonthly: Math.max(0, summary.annualTotal - paidMonthly),
    balanceLicense: Math.max(0, summary.licenseTotal - paidLicense),
    totalPaid: paidEntry + paidMonthly + paidLicense,
  };
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
