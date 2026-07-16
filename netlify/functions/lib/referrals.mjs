import { matchRecommender } from "./roster.mjs";
import { getApplicationsStore } from "./store.mjs";

const REFERRALS_KEY = "meta:referral-points";

export const getReferralLedger = async () => {
  const store = getApplicationsStore();
  return (
    (await store.get(REFERRALS_KEY, { type: "json" })) || {
      byMemberId: {},
      awarded: {},
    }
  );
};

const saveReferralLedger = async (ledger) => {
  const store = getApplicationsStore();
  await store.setJSON(REFERRALS_KEY, ledger);
  return ledger;
};

export const awardReferralPoint = async (application) => {
  if (!application || application.referralAwarded) {
    return { awarded: false, reason: "already-awarded" };
  }

  const member =
    application.recommenderMemberId && application.recommenderMatchedName
      ? {
          id: application.recommenderMemberId,
          fullName: application.recommenderMatchedName,
          displayName: application.recommenderMatchedName,
        }
      : await matchRecommender(application.recommender);

  if (!member) {
    return { awarded: false, reason: "no-match" };
  }

  const ledger = await getReferralLedger();
  if (ledger.awarded[application.code]) {
    return { awarded: false, reason: "already-awarded" };
  }

  if (!ledger.byMemberId[member.id]) {
    ledger.byMemberId[member.id] = {
      memberId: member.id,
      name: member.displayName || member.fullName,
      points: 0,
      history: [],
    };
  }

  ledger.byMemberId[member.id].points += 1;
  ledger.byMemberId[member.id].history.push({
    applicationCode: application.code,
    candidateName: application.name,
    at: new Date().toISOString(),
  });
  ledger.awarded[application.code] = member.id;

  await saveReferralLedger(ledger);

  application.recommenderMemberId = member.id;
  application.recommenderMatchedName = member.displayName || member.fullName;
  application.referralAwarded = true;
  application.referralAwardedAt = new Date().toISOString();

  return {
    awarded: true,
    memberId: member.id,
    memberName: member.displayName || member.fullName,
    points: ledger.byMemberId[member.id].points,
  };
};

export const buildReferralLeaderboard = (ledger, members = []) => {
  const memberNames = new Map(members.map((member) => [member.id, member.displayName || member.fullName]));

  return Object.values(ledger.byMemberId || {})
    .map((entry) => ({
      memberId: entry.memberId,
      name: entry.name || memberNames.get(entry.memberId) || entry.memberId,
      points: entry.points || 0,
      referrals: entry.history?.length || 0,
      lastReferralAt: entry.history?.at(-1)?.at || null,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "pl"));
};

export const attachReferralToApplication = async (application) => {
  const member = await matchRecommender(application.recommender);
  if (!member) {
    return { ok: false, error: "Nie znaleziono członka klubu o podanym nazwisku w bazie PZSS." };
  }

  application.recommenderMemberId = member.id;
  application.recommenderMatchedName = member.displayName || member.fullName;
  application.recommenderLastName = member.lastName;
  return { ok: true, member };
};
