import { summarizeLicenseCounts } from "./license-data.mjs";

const LICENSE_FEE_PLN = 50;

const birthDateFromPesel = (pesel) => {
  const digits = String(pesel || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits)) return null;

  let year = Number(digits.slice(0, 2));
  let month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));

  if (month > 80) {
    month -= 80;
    year += 1800;
  } else if (month > 60) {
    month -= 60;
    year += 2200;
  } else if (month > 40) {
    month -= 40;
    year += 2100;
  } else if (month > 20) {
    month -= 20;
    year += 2000;
  } else {
    year += 1900;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const ageOnDate = (birthDate, referenceDate) => {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
};

export const buildLicenseRenewalSummary = (members = [], options = {}) => {
  const renewalYear = Number(options.renewalYear) || new Date().getFullYear();
  const yearEnd = new Date(renewalYear, 11, 31);

  const summary = {
    renewalYear,
    licenseFeePln: LICENSE_FEE_PLN,
    totalPlayers: 0,
    activePlayers: 0,
    blockedPlayers: 0,
    renewals: 0,
    newLicenses: 0,
    minors: 0,
    adults: 0,
    unknownAge: 0,
    activeLicenses: 0,
    inactiveLicenses: 0,
    unknownLicenses: 0,
    estimatedClubCostPln: 0,
    joinedByYear: {},
    updatedAt: new Date().toISOString(),
  };

  let hasLicenseData = false;

  for (const member of members) {
    summary.totalPlayers += 1;

    const isActive = member.active !== false;
    if (isActive) summary.activePlayers += 1;
    else summary.blockedPlayers += 1;

    const joinedYear = String(member.memberSince || "").slice(0, 4);
    if (joinedYear) {
      summary.joinedByYear[joinedYear] = (summary.joinedByYear[joinedYear] || 0) + 1;
    }

    if (member.licenseActive === true || member.licenseActive === false) {
      hasLicenseData = true;
    }

    if (!isActive) continue;

    const birthDate = birthDateFromPesel(member.pesel);
    if (!birthDate) {
      summary.unknownAge += 1;
    } else {
      const age = ageOnDate(birthDate, yearEnd);
      if (age < 18) summary.minors += 1;
      else summary.adults += 1;
    }
  }

  const licenseCounts = summarizeLicenseCounts(members);
  summary.activeLicenses = licenseCounts.activeLicenses;
  summary.inactiveLicenses = licenseCounts.inactiveLicenses;
  summary.unknownLicenses = licenseCounts.unknownLicenses;

  if (hasLicenseData) {
    for (const member of members) {
      if (member.active === false) continue;
      if (member.licenseActive === false) summary.renewals += 1;
      else if (member.licenseActive === true) continue;
      else {
        const joinedYear = String(member.memberSince || "").slice(0, 4);
        if (joinedYear === String(renewalYear)) summary.newLicenses += 1;
        else summary.renewals += 1;
      }
    }
    summary.estimatedClubCostPln = summary.inactiveLicenses * LICENSE_FEE_PLN;
  } else {
    for (const member of members) {
      if (member.active === false) continue;
      const joinedYear = String(member.memberSince || "").slice(0, 4);
      if (joinedYear === String(renewalYear)) summary.newLicenses += 1;
      else summary.renewals += 1;
    }
    summary.estimatedClubCostPln = summary.activePlayers * LICENSE_FEE_PLN;
  }

  return summary;
};
