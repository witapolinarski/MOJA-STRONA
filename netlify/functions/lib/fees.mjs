export const ENTRY_FEE = 350;
export const MONTHLY_FEE = 30;
export const LICENSE_FEE_ANNUAL = 100;

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
  const months = countFeeMonths(acceptanceDate);
  const annualFee = months * MONTHLY_FEE;
  const total = ENTRY_FEE + annualFee;

  return {
    entryFee: ENTRY_FEE,
    monthlyFee: MONTHLY_FEE,
    months,
    annualFee,
    total,
    totalGrosze: Math.round(total * 100),
    acceptanceDate: acceptanceDate.toISOString().slice(0, 10),
  };
};
