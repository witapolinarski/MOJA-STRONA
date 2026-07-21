import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { buildReferralLeaderboard, getReferralLedger } from "./lib/referrals.mjs";
import { buildLicenseRenewalSummary } from "./lib/license-stats.mjs";
import {
  ensureRosterSeeded,
  getRosterRecord,
  mergePzssRosterImport,
  parsePzssRosterText,
  saveRosterMembers,
} from "./lib/roster.mjs";

export default async (request) => {
  const auth = await requireApprover(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      await ensureRosterSeeded();
      const roster = await getRosterRecord();
      const ledger = await getReferralLedger();
      const leaderboard = buildReferralLeaderboard(ledger, roster.members || []);
      const licenseSummary = buildLicenseRenewalSummary(roster.members || []);

      return jsonResponse({
        roster: {
          updatedAt: roster.updatedAt,
          source: roster.source,
          memberCount: roster.members?.length || 0,
          activeCount: roster.members?.filter((member) => member.active !== false).length || 0,
          members: roster.members || [],
        },
        licenseSummary,
        referrals: {
          totalPoints: leaderboard.reduce((sum, entry) => sum + entry.points, 0),
          leaderboard,
        },
      });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const text = String(body.text || "").trim();
      const members = Array.isArray(body.members) ? body.members : parsePzssRosterText(text);

      if (!members.length) {
        return jsonResponse(
          { error: "Nie udało się odczytać listy członków. Wklej eksport z PZSS (SOZ → Lista zawodników)." },
          400,
        );
      }

      await ensureRosterSeeded();
      const current = await getRosterRecord();
      const mergedMembers = mergePzssRosterImport(current.members || [], members);

      const saved = await saveRosterMembers(mergedMembers, {
        source: body.source || "pzss-import",
        importedBy: auth.member.name,
      });

      return jsonResponse({
        ok: true,
        memberCount: saved.memberCount,
        updatedAt: saved.updatedAt,
      });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd obsługi bazy członków." }, 500);
  }
};
