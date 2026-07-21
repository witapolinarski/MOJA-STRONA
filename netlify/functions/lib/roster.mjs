import { applyStruckOffFlags } from "./fees.mjs";
import { findRosterMember } from "./names.mjs";
import { getApplicationsStore } from "./store.mjs";
import { clearPaymentsAnalysis } from "./payments-file.mjs";
import seedData from "../../../data/club-roster.seed.json" with { type: "json" };

const ROSTER_KEY = "meta:club-roster";

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
    const memberUntil = parts[4] || "";

    members.push({
      id: `pzss-${pesel}`,
      lastName,
      firstName,
      fullName: `${firstName} ${lastName}`.trim(),
      displayName: namePart,
      pesel,
      email: parts[2] || "",
      memberSince: parts[3] || "",
      memberUntil,
      active: !memberUntil,
    });
  }

  const unique = new Map();
  for (const member of members) unique.set(member.id, member);
  return [...unique.values()];
};

export const getActiveRosterMembers = (members = []) =>
  (members || []).filter((member) => member.active !== false);

export const mergePzssRosterImport = (currentMembers = [], importedMembers = []) => {
  const existingById = new Map((currentMembers || []).map((member) => [member.id, member]));

  const merged = (importedMembers || []).map((member) => {
    const existing = existingById.get(member.id);
    return {
      ...member,
      licenseActive: member.licenseActive ?? existing?.licenseActive ?? null,
      licenseStatus: member.licenseStatus ?? existing?.licenseStatus ?? null,
      licenseValidYear: member.licenseValidYear ?? existing?.licenseValidYear ?? null,
      licenseLastValidYear: member.licenseLastValidYear ?? existing?.licenseLastValidYear ?? null,
      licenseValidUntil: member.licenseValidUntil ?? existing?.licenseValidUntil ?? null,
      licenseNumber: member.licenseNumber ?? existing?.licenseNumber ?? null,
      licenseIssuedAt: member.licenseIssuedAt ?? existing?.licenseIssuedAt ?? null,
    };
  });

  merged.sort((a, b) => String(a.lastName).localeCompare(String(b.lastName), "pl"));
  return applyStruckOffFlags(merged);
};

export const getRosterRecord = async () => {
  const store = getApplicationsStore();
  return (
    (await store.get(ROSTER_KEY, { type: "json" })) || {
      members: [],
      updatedAt: null,
      source: null,
    }
  );
};

export const getRosterMembers = async () => {
  const record = await getRosterRecord();
  return record.members || [];
};

export const saveRosterMembers = async (members, meta = {}) => {
  const store = getApplicationsStore();
  const payload = {
    members,
    updatedAt: new Date().toISOString(),
    source: meta.source || "import",
    importedBy: meta.importedBy || null,
    memberCount: members.length,
  };
  await store.setJSON(ROSTER_KEY, payload);
  await clearPaymentsAnalysis();
  return payload;
};

export const ensureRosterSeeded = async () => {
  const record = await getRosterRecord();
  if (record.members?.length) return record;

  if (seedData.members?.length) {
    return saveRosterMembers(seedData.members, { source: seedData.source || "seed" });
  }

  return record;
};

export const matchRecommender = async (recommender) => {
  const members = await getRosterMembers();
  if (!members.length) await ensureRosterSeeded();
  return findRosterMember(recommender, await getRosterMembers());
};
