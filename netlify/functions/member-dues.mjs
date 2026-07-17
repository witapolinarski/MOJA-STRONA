import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { parsePaymentsSpreadsheet, reconcileDues } from "./lib/dues.mjs";
import {
  getPaymentsFile,
  getPaymentsMeta,
  savePaymentsFile,
} from "./lib/payments-file.mjs";
import { ensureRosterSeeded, getRosterRecord } from "./lib/roster.mjs";

const analyzePayments = async () => {
  await ensureRosterSeeded();
  const [meta, file, roster] = await Promise.all([
    getPaymentsMeta(),
    getPaymentsFile(),
    getRosterRecord(),
  ]);

  if (!file) {
    return {
      file: meta,
      reconciliation: null,
      parse: null,
    };
  }

  const buffer = Buffer.from(await file.data.arrayBuffer());
  const parsed = parsePaymentsSpreadsheet(buffer, file.fileName);
  const reconciliation = reconcileDues(roster.members || [], parsed.records);

  return {
    file: meta,
    parse: {
      rowCount: parsed.rowCount,
      notes: parsed.notes,
      headers: parsed.headers,
    },
    reconciliation,
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

      const result = await analyzePayments();
      return jsonResponse(result);
    }

    if (request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file.arrayBuffer !== "function") {
        return jsonResponse({ error: "Wybierz plik Excel (.xlsx) lub CSV ze stanem wpłat." }, 400);
      }

      const meta = await savePaymentsFile(file, auth.member.name);
      const result = await analyzePayments();

      return jsonResponse({
        ok: true,
        file: meta,
        parse: result.parse,
        reconciliation: result.reconciliation,
      });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd obsługi zestawienia składek." }, 500);
  }
};
