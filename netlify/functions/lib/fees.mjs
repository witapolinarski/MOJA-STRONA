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

export const memberHasCurrentLicense = (member) => {
  if (member?.licenseActive === true) return true;
  const status = String(member?.licenseStatus || "").toLowerCase();
  return /wazn|ważn|active|aktualn/.test(status);
};

export const memberHasLicenseHistory = (member) =>
  member?.licenseActive === true ||
  member?.licenseActive === false ||
  member?.licenseStatus ||
  member?.licenseValidYear ||
  member?.licenseLastValidYear;

export const buildMemberObligationSchedule = (member, asOf = new Date()) => {
  const since = member?.memberSince ? String(member.memberSince).slice(0, 10) : null;
  if (!since) return null;

  const dueYears = listDueMembershipYears(since, asOf);
  if (dueYears == null) return null;

  const obligations = [{ type: "entry", year: null, amount: ENTRY_FEE, label: "wpisowe" }];
  const includeLicense = memberHasCurrentLicense(member) && memberHasLicenseHistory(member);

  for (const year of dueYears) {
    const membershipAmount = annualMembershipFeeForMemberYear(since, year, asOf);
    if (membershipAmount > 0) {
      obligations.push({
        type: "membership",
        year,
        amount: membershipAmount,
        label: `składka ${year}`,
      });
    }

    if (includeLicense) {
      obligations.push({
        type: "license",
        year,
        amount: LICENSE_FEE_ANNUAL,
        label: `licencja ${year}`,
      });
    }
  }

  return obligations;
};

export const summarizeObligationSchedule = (obligations = []) => {
  const entryFee = obligations
    .filter((item) => item.type === "entry")
    .reduce((sum, item) => sum + item.amount, 0);
  const annualTotal = obligations
    .filter((item) => item.type === "membership")
    .reduce((sum, item) => sum + item.amount, 0);
  const licenseTotal = obligations
    .filter((item) => item.type === "license")
    .reduce((sum, item) => sum + item.amount, 0);
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
