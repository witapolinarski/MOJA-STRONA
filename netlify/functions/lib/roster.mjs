import { findRosterMember } from "./names.mjs";
import { getApplicationsStore } from "./store.mjs";
import { clearPaymentsAnalysis } from "./payments-file.mjs";
import seedData from "../../../data/club-roster.seed.json" with { type: "json" };

const ROSTER_KEY = "meta:club-roster";
const SOZ_REMOVED_REASON = "Brak na liście SOZ (Club/Persons/List)";

export const parsePzssRosterText = (text) => {
  const members = [];

  for (const line of String(text || "").split("\n")) {
    if (!line.includes("\t")) continue;

    const parts = line.split("\t").map((part) => part.trim());
    const namePart = parts[0];
    const pesel = parts[1];

    if (!namePart || !/^\d{11}$/.test(pesel)) continue;
    if (/imię i nazwisko/i.test(namePart)) continue;

    const tokens = namePart.split(/\s+/).filter(Boolean);
    const lastName = tokens[0] || "";
    const firstName = tokens.slice(1).join(" ");

    members.push({
      id: `pzss-${pesel}`,
      lastName,
      firstName,
      fullName: `${firstName} ${lastName}`.trim(),
      displayName: namePart,
      pesel,
      email: parts[2] || "",
      memberSince: parts[3] || "",
      memberUntil: "",
      active: true,
    });
  }

  const unique = new Map();
  for (const member of members) unique.set(member.id, member);
  return [...unique.values()];
};

export const getActiveRosterMembers = (members = []) =>
  (members || []).filter((member) => member.active !== false);

export const mergePzssRosterImport = (
  currentMembers = [],
  importedMembers = [],
  previousRemoved = [],
) => {
  const existingById = new Map((currentMembers || []).map((member) => [member.id, member]));
  const importedById = new Map((importedMembers || []).map((member) => [member.id, member]));
  const removedAt = new Date().toISOString();

  const merged = (importedMembers || []).map((member) => {
    const existing = existingById.get(member.id);
    return {
      ...member,
      active: true,
      memberUntil: "",
      licenseActive: member.licenseActive ?? existing?.licenseActive ?? null,
      licenseStatus: member.licenseStatus ?? existing?.licenseStatus ?? null,
      licenseValidYear: member.licenseValidYear ?? existing?.licenseValidYear ?? null,
      licenseLastValidYear: member.licenseLastValidYear ?? existing?.licenseLastValidYear ?? null,
      licenseValidUntil: member.licenseValidUntil ?? existing?.licenseValidUntil ?? null,
      licenseNumber: member.licenseNumber ?? existing?.licenseNumber ?? null,
      licenseIssuedAt: member.licenseIssuedAt ?? existing?.licenseIssuedAt ?? null,
    };
  });

  const removedNow = (currentMembers || [])
    .filter((member) => !importedById.has(member.id))
    .map((member) => ({
      ...member,
      active: false,
      removedAt,
      removedReason: SOZ_REMOVED_REASON,
    }));

  const removedById = new Map((previousRemoved || []).map((member) => [member.id, member]));
  for (const member of removedNow) removedById.set(member.id, member);
  for (const id of importedById.keys()) removedById.delete(id);

  const removedMembers = [...removedById.values()].sort((a, b) =>
    String(a.lastName).localeCompare(String(b.lastName), "pl"),
  );

  merged.sort((a, b) => String(a.lastName).localeCompare(String(b.lastName), "pl"));
  return { members: merged, removedMembers };
};

export const getRosterRecord = async () => {
  const store = getApplicationsStore();
  return (
    (await store.get(ROSTER_KEY, { type: "json" })) || {
      members: [],
      removedMembers: [],
      updatedAt: null,
      source: null,
    }
  );
};

export const getRosterMembers = async () => {
  const record = await getRosterRecord();
  return record.members || [];
};

export const saveRosterMembers = async (payload, meta = {}) => {
  const store = getApplicationsStore();
  const members = Array.isArray(payload) ? payload : payload.members || [];
  const removedMembers = Array.isArray(payload)
    ? meta.removedMembers || []
    : payload.removedMembers || [];

  const rosterPayload = {
    members,
    removedMembers,
    updatedAt: new Date().toISOString(),
    source: meta.source || "import",
    importedBy: meta.importedBy || null,
    memberCount: members.length,
    removedCount: removedMembers.length,
  };
  await store.setJSON(ROSTER_KEY, rosterPayload);
  await clearPaymentsAnalysis();
  return rosterPayload;
};

export const ensureRosterSeeded = async () => {
  const record = await getRosterRecord();
  if (record.members?.length) return record;

  if (seedData.members?.length) {
    return saveRosterMembers(
      { members: seedData.members, removedMembers: [] },
      { source: seedData.source || "seed" },
    );
  }

  return record;
};

export const matchRecommender = async (recommender) => {
  const members = await getRosterMembers();
  if (!members.length) await ensureRosterSeeded();
  return findRosterMember(recommender, await getRosterMembers());
};
