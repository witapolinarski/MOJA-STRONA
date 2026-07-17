import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { parsePaymentsSpreadsheet, reconcileDues } from "./lib/dues.mjs";
import {
  getPaymentsAnalysis,
  getPaymentsFile,
  getPaymentsMeta,
  savePaymentsAnalysis,
  savePaymentsBuffer,
  savePaymentsFile,
} from "./lib/payments-file.mjs";
import { ensureRosterSeeded, getRosterRecord } from "./lib/roster.mjs";

const trimReconciliation = (reconciliation) => {
  if (!reconciliation) return null;

  const arrears = reconciliation.arrears || [];
  return {
    ...reconciliation,
    arrears: arrears.slice(0, 400),
    arrearsTotal: arrears.length,
  };
};

const analyzeBuffer = async (buffer, fileName) => {
  await ensureRosterSeeded();
  const roster = await getRosterRecord();
  const parsed = parsePaymentsSpreadsheet(buffer, fileName);
  const reconciliation = reconcileDues(roster.members || [], parsed.records);

  return {
    parse: {
      rowCount: parsed.rowCount,
      notes: parsed.notes,
      headers: parsed.headers,
    },
    reconciliation,
  };
};

const analyzePayments = async () => {
  const [meta, file] = await Promise.all([getPaymentsMeta(), getPaymentsFile()]);

  if (!file) {
    return {
      file: meta,
      reconciliation: null,
      parse: null,
    };
  }

  const cached = await getPaymentsAnalysis(meta);
  if (cached) {
    return {
      file: meta,
      parse: cached.parse,
      reconciliation: trimReconciliation(cached.reconciliation),
      cached: true,
      cachedAt: cached.cachedAt,
    };
  }

  const buffer = Buffer.from(await file.data.arrayBuffer());
  const result = await analyzeBuffer(buffer, file.fileName);
  await savePaymentsAnalysis(meta, result);

  return {
    file: meta,
    parse: result.parse,
    reconciliation: trimReconciliation(result.reconciliation),
    cached: false,
  };
};

const persistAndAnalyze = async (buffer, fileMeta) => {
  const result = await analyzeBuffer(buffer, fileMeta.fileName);
  await savePaymentsAnalysis(fileMeta, result);
  return result;
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
      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const body = await request.json();
        const text = String(body.text || "").trim();
        if (!text) {
          return jsonResponse({ error: "Wklej zestawienie operacji lub listę wpłat przed importem." }, 400);
        }

        const buffer = Buffer.from(text, "utf8");
        const meta = await savePaymentsBuffer(
          buffer,
          "zestawienie-wklejone.txt",
          auth.member.name,
          "text/plain",
        );
        const result = await persistAndAnalyze(buffer, meta);

        return jsonResponse({
          ok: true,
          file: meta,
          parse: result.parse,
          reconciliation: trimReconciliation(result.reconciliation),
        });
      }

      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file.arrayBuffer !== "function") {
        return jsonResponse({ error: "Wybierz plik zestawienia lub wklej dane w pole tekstowe." }, 400);
      }

      const meta = await savePaymentsFile(file, auth.member.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await persistAndAnalyze(buffer, meta);

      return jsonResponse({
        ok: true,
        file: meta,
        parse: result.parse,
        reconciliation: trimReconciliation(result.reconciliation),
      });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd obsługi zestawienia składek." }, 500);
  }
};
