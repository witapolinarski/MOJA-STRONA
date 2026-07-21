import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { parsePaymentsSpreadsheet, reconcileDues } from "./lib/dues.mjs";
import {
  getPaymentsFile,
  getPaymentsMeta,
  getPaymentsParsed,
  savePaymentsParsed,
  savePaymentsFile,
} from "./lib/payments-file.mjs";
import { ensureRosterSeeded, getActiveRosterMembers, getRosterRecord } from "./lib/roster.mjs";

const loadPaymentRecords = async (meta, file) => {
  if (!file) return { records: [], parse: null };

  const cachedParsed = await getPaymentsParsed(meta);
  if (cachedParsed) {
    return {
      records: cachedParsed.records || [],
      parse: {
        rowCount: cachedParsed.rowCount,
        notes: cachedParsed.notes || [],
        cached: true,
      },
    };
  }

  const buffer = Buffer.from(await file.data.arrayBuffer());
  const parsed = parsePaymentsSpreadsheet(buffer, file.fileName);
  await savePaymentsParsed(meta, parsed);

  return {
    records: parsed.records,
    parse: {
      rowCount: parsed.rowCount,
      notes: parsed.notes || [],
      cached: false,
    },
  };
};

const buildReport = async () => {
  await ensureRosterSeeded();
  const roster = await getRosterRecord();
  const members = getActiveRosterMembers(roster.members || []);
  const meta = await getPaymentsMeta();
  const file = await getPaymentsFile();

  const { records, parse } = await loadPaymentRecords(meta, file);
  const reconciliation = reconcileDues(members, records);

  return {
    rosterUpdatedAt: roster.updatedAt,
    rosterMemberCount: members.length,
    file: meta,
    parse,
    reconciliation,
    cached: false,
  };
};

export default async (request) => {
  const auth = await requireApprover(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.searchParams.get("download") === "1") {
        const file = await getPaymentsFile();
        if (!file) return jsonResponse({ error: "Brak zapisanego pliku składek." }, 404);

        return new Response(file.data, {
          status: 200,
          headers: {
            "Content-Type": file.contentType,
            "Content-Disposition": `attachment; filename="${file.fileName}"`,
            "Cache-Control": "no-store",
          },
        });
      }

      if (url.searchParams.get("refresh") === "1") {
        const { clearPaymentsParsed } = await import("./lib/payments-file.mjs");
        await clearPaymentsParsed();
      }

      return jsonResponse(await buildReport());
    }

    if (request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file.arrayBuffer !== "function") {
        return jsonResponse({ error: "Wybierz plik zestawienia bankowego." }, 400);
      }

      await savePaymentsFile(file, auth.member.name);
      return jsonResponse({ ok: true, ...(await buildReport()) });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd zestawienia składek." }, 500);
  }
};
