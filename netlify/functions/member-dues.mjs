import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { parsePaymentsSpreadsheet, reconcileDues } from "./lib/dues.mjs";
import {
  getPaymentsAnalysis,
  getPaymentsFile,
  getPaymentsMeta,
  getPaymentsParsed,
  savePaymentsAnalysis,
  savePaymentsFile,
  savePaymentsParsed,
} from "./lib/payments-file.mjs";
import { ensureRosterSeeded, getRosterRecord } from "./lib/roster.mjs";

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
  const members = roster.members || [];
  const meta = await getPaymentsMeta();
  const file = await getPaymentsFile();

  const cached = meta ? await getPaymentsAnalysis(meta) : null;
  if (cached?.reconciliation?.members?.length) {
    return {
      rosterUpdatedAt: roster.updatedAt,
      file: meta,
      parse: cached.parse,
      reconciliation: cached.reconciliation,
      cached: true,
      cachedAt: cached.cachedAt,
    };
  }

  const { records, parse } = await loadPaymentRecords(meta, file);
  const reconciliation = reconcileDues(members, records);

  if (meta) {
    await savePaymentsAnalysis(meta, { parse, reconciliation });
  }

  return {
    rosterUpdatedAt: roster.updatedAt,
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
        const meta = await getPaymentsMeta();
        if (meta) {
          const { clearPaymentsAnalysis } = await import("./lib/payments-file.mjs");
          await clearPaymentsAnalysis();
        }
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
