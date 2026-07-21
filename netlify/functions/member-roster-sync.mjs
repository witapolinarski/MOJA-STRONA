import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { getRosterExportMeta, saveRosterExportFile, saveRosterExportBuffer } from "./lib/roster-file.mjs";
import { importPzssRosterBuffer, importPzssRosterText, runPzssRosterSync } from "./lib/roster-sync.mjs";
import { SOZ_PERSONS_LIST_URL } from "./lib/pzss-soz.mjs";
import { ensureRosterSeeded, getRosterRecord } from "./lib/roster.mjs";

const SOZ_ORIGIN = "https://soz.pzss.org.pl";

const corsHeaders = {
  "Access-Control-Allow-Origin": SOZ_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Roster-Sync-Secret",
};

const withCors = (response) => {
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
};

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
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204, headers: corsHeaders }));
  }

  try {
    if (request.method === "GET") {
      const auth = await requireApprover(request);
      if (!auth.ok) return withCors(auth.response);

      await ensureRosterSeeded();
      const roster = await getRosterRecord();
      const exportFile = await getRosterExportMeta();

      return withCors(
        jsonResponse({
          roster: {
            updatedAt: roster.updatedAt,
            memberCount: roster.members?.length || 0,
            activeCount: roster.members?.filter((member) => member.active !== false).length || 0,
            source: roster.source,
          },
          exportFile,
          sozListUrl: SOZ_PERSONS_LIST_URL,
          sozCredentials: Boolean(process.env.PZSS_SOZ_LOGIN && process.env.PZSS_SOZ_PASSWORD),
          autoSyncUrl: Boolean(process.env.PZSS_ROSTER_URL),
        }),
      );
    }

    if (request.method === "POST") {
      const auth = await authorizeSync(request);
      if (!auth.ok) return withCors(auth.response);

      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || typeof file.arrayBuffer !== "function") {
          return withCors(jsonResponse({ error: "Wybierz plik eksportu PZSS (.txt, .tsv, .csv)." }, 400));
        }

        const meta = await saveRosterExportFile(file, auth.importedBy);
        const buffer = Buffer.from(await file.arrayBuffer());
        const saved = await importPzssRosterBuffer(buffer, {
          source: "pzss-export-upload",
          importedBy: auth.importedBy,
        });

        return withCors(
          jsonResponse({
            ok: true,
            memberCount: saved.memberCount,
            updatedAt: saved.updatedAt,
            file: meta,
          }),
        );
      }

      if (contentType.includes("application/json")) {
        const body = await request.json();
        const text = String(body.text || "").trim();

        if (text) {
          await saveRosterExportBuffer(Buffer.from(text, "utf8"), "soz-persons-list.txt", auth.importedBy);
          const saved = await importPzssRosterText(text, {
            source: body.source || "soz-persons-list",
            importedBy: auth.importedBy,
          });

          return withCors(
            jsonResponse({
              ok: true,
              memberCount: saved.memberCount,
              updatedAt: saved.updatedAt,
            }),
          );
        }
      }

      const saved = await runPzssRosterSync({
        importedBy: auth.importedBy,
        source: "pzss-auto-sync",
      });

      return withCors(
        jsonResponse({
          ok: true,
          memberCount: saved.memberCount,
          updatedAt: saved.updatedAt,
        }),
      );
    }

    return withCors(jsonResponse({ error: "Metoda niedozwolona." }, 405));
  } catch (error) {
    console.error(error);
    return withCors(jsonResponse({ error: error.message || "Błąd synchronizacji bazy PZSS." }, 500));
  }
};
