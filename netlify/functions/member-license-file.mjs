import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import {
  mergeLicenseRegisterIntoRoster,
  parseLicenseRegister,
} from "./lib/license-import.mjs";
import {
  getLicenseRegisterFile,
  getLicenseRegisterMeta,
  saveLicenseRegisterFile,
} from "./lib/license-file.mjs";
import { ensureRosterSeeded, getRosterRecord, saveRosterMembers } from "./lib/roster.mjs";

export default async (request) => {
  const auth = await requireApprover(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.searchParams.get("download") === "1") {
        const file = await getLicenseRegisterFile();
        if (!file) return jsonResponse({ error: "Brak zapisanego rejestru licencji." }, 404);

        return new Response(file.data, {
          status: 200,
          headers: {
            "Content-Type": file.contentType,
            "Content-Disposition": `attachment; filename="${file.fileName}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      return jsonResponse({
        file: await getLicenseRegisterMeta(),
      });
    }

    if (request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file.arrayBuffer !== "function") {
        return jsonResponse({ error: "Wybierz plik Excel (.xlsx) lub CSV z rejestrem licencji PZSS." }, 400);
      }

      const meta = await saveLicenseRegisterFile(file, auth.member.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = parseLicenseRegister(buffer, file.name);

      if (!parsed.records.length) {
        return jsonResponse(
          { error: parsed.notes.join(" ") || "Nie udało się odczytać rejestru licencji." },
          400,
        );
      }

      await ensureRosterSeeded();
      const roster = await getRosterRecord();
      const merged = mergeLicenseRegisterIntoRoster(roster.members || [], parsed.records);
      const saved = await saveRosterMembers(
        {
          members: merged.members,
          removedMembers: roster.removedMembers || [],
        },
        {
        source: "pzss-license-register",
        importedBy: auth.member.name,
      });

      return jsonResponse({
        ok: true,
        file: meta,
        parse: {
          rowCount: parsed.rowCount,
          notes: parsed.notes,
        },
        import: {
          matched: merged.matched,
          unmatched: merged.unmatched.slice(0, 30),
          unmatchedCount: merged.unmatched.length,
          memberCount: saved.memberCount,
          updatedAt: saved.updatedAt,
        },
      });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd importu rejestru licencji." }, 500);
  }
};
