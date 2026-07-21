import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { getRosterExportMeta, saveRosterExportFile } from "./lib/roster-file.mjs";
import { importPzssRosterBuffer, runPzssRosterSync } from "./lib/roster-sync.mjs";
import { getRosterRecord } from "./lib/roster.mjs";
import { ensureRosterSeeded } from "./lib/roster.mjs";

const authorizeSync = async (request) => {
  const secret = process.env.ROSTER_SYNC_SECRET || process.env.ADMIN_PASSWORD || "";
  const headerSecret = request.headers.get("x-roster-sync-secret") || "";

  if (secret && headerSecret && headerSecret === secret) {
    return { ok: true, importedBy: "automat" };
  }

  const auth = await requireApprover(request);
  if (!auth.ok) return auth;
  return { ok: true, importedBy: auth.member.name };
};

export default async (request) => {
  try {
    if (request.method === "GET") {
      const auth = await requireApprover(request);
      if (!auth.ok) return auth.response;

      await ensureRosterSeeded();
      const roster = await getRosterRecord();
      const exportFile = await getRosterExportMeta();

      return jsonResponse({
        roster: {
          updatedAt: roster.updatedAt,
          memberCount: roster.members?.length || 0,
          activeCount: roster.members?.filter((member) => member.active !== false).length || 0,
          source: roster.source,
        },
        exportFile,
        autoSyncUrl: Boolean(process.env.PZSS_ROSTER_URL),
      });
    }

    if (request.method === "POST") {
      const auth = await authorizeSync(request);
      if (!auth.ok) return auth.response;

      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || typeof file.arrayBuffer !== "function") {
          return jsonResponse({ error: "Wybierz plik eksportu PZSS (.txt, .tsv, .csv)." }, 400);
        }

        const meta = await saveRosterExportFile(file, auth.importedBy);
        const buffer = Buffer.from(await file.arrayBuffer());
        const saved = await importPzssRosterBuffer(buffer, {
          source: "pzss-export-upload",
          importedBy: auth.importedBy,
        });

        return jsonResponse({
          ok: true,
          memberCount: saved.memberCount,
          updatedAt: saved.updatedAt,
          file: meta,
        });
      }

      const saved = await runPzssRosterSync({
        importedBy: auth.importedBy,
        source: "pzss-auto-sync",
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
    return jsonResponse({ error: error.message || "Błąd synchronizacji bazy PZSS." }, 500);
  }
};
