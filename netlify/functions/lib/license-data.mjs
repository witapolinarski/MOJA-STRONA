const CURRENT_YEAR = new Date().getFullYear();

export const parseLicenseValidYear = (value) => {
  const match = String(value || "").match(/(\d{4})/);
  return match ? Number(match[1]) : null;
};

export const normalizeLicenseRecord = (record = {}) => {
  const status = String(record.status || "").trim();
  const validUntil = String(record.validUntil || "").trim();
  const validYear = parseLicenseValidYear(validUntil);
  const isCurrent = /^ważne$/i.test(status);

  return {
    licenseStatus: status || null,
    licenseActive: isCurrent,
    licenseValidUntil: validUntil || null,
    licenseValidYear: isCurrent ? validYear : null,
    licenseLastValidYear: isCurrent ? null : validYear,
    licenseNumber: record.licenseNumber || null,
    licenseType: record.licenseType || "Licencja Zawodnicza",
    licenseUpdatedAt: record.updatedAt || null,
  };
};

export const pickBestLicense = (records = []) => {
  if (!records.length) return null;

  const sorted = [...records].sort((a, b) => {
    const aCurrent = /^ważne$/i.test(a.status) ? 1 : 0;
    const bCurrent = /^ważne$/i.test(b.status) ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    return String(b.validUntil || "").localeCompare(String(a.validUntil || ""));
  });

  return sorted[0];
};

export const mergeLicenseIntoMember = (member, licenseRecord) => {
  if (!licenseRecord) {
    return {
      ...member,
      licenseActive: member.licenseActive ?? null,
      licenseStatus: member.licenseStatus ?? null,
      licenseValidYear: member.licenseValidYear ?? null,
      licenseLastValidYear: member.licenseLastValidYear ?? null,
      licenseValidUntil: member.licenseValidUntil ?? null,
      licenseNumber: member.licenseNumber ?? null,
    };
  }

  const license =
    "licenseActive" in licenseRecord
      ? licenseRecord
      : normalizeLicenseRecord(licenseRecord);
  return { ...member, ...license };
};

export const summarizeLicenseCounts = (members = []) => {
  let activeLicenses = 0;
  let inactiveLicenses = 0;
  let unknownLicenses = 0;

  for (const member of members) {
    if (member.licenseActive === true) activeLicenses += 1;
    else if (member.licenseActive === false) inactiveLicenses += 1;
    else unknownLicenses += 1;
  }

  return {
    renewalYear: CURRENT_YEAR,
    activeLicenses,
    inactiveLicenses,
    unknownLicenses,
    totalWithLicenseData: activeLicenses + inactiveLicenses,
  };
};
