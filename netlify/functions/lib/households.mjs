import { normalizeText } from "./names.mjs";

const householdKey = (member) =>
  `${normalizeText(member.lastName)}|${String(member.memberSince || "").slice(0, 10)}`;

export const buildHouseholdGroups = (members = []) => {
  const active = (members || []).filter((member) => member.active !== false);
  const byKey = new Map();

  for (const member of active) {
    const key = householdKey(member);
    const bucket = byKey.get(key) || [];
    bucket.push(member);
    byKey.set(key, bucket);
  }

  const households = [];
  const householdByMemberId = new Map();

  for (const group of byKey.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((left, right) =>
      String(left.firstName || left.displayName).localeCompare(String(right.firstName || right.displayName), "pl"),
    );
    const household = {
      id: sorted.map((member) => member.id).join(","),
      members: sorted,
      key: householdKey(sorted[0]),
    };

    households.push(household);
    for (const member of sorted) {
      householdByMemberId.set(member.id, household);
    }
  }

  return { households, householdByMemberId };
};

export const isHouseholdMember = (member, householdByMemberId) => householdByMemberId.has(member?.id);
