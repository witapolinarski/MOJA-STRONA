import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { parsePaymentsSpreadsheet, reconcileDues } from "./lib/dues.mjs";
import { getPaymentsFile, getPaymentsMeta, savePaymentsFile } from "./lib/payments-file.mjs";
import { ensureRosterSeeded, getRosterRecord } from "./lib/roster.mjs";

const buildReport = async () => {
  await ensureRosterSeeded();
  const roster = await getRosterRecord();
  const members = roster.members || [];
  const meta = await getPaymentsMeta();
  const file = await getPaymentsFile();

  let paymentRecords = [];
  let parse = null;

  if (file) {
    const buffer = Buffer.from(await file.data.arrayBuffer());
    const parsed = parsePaymentsSpreadsheet(buffer, file.fileName);
    paymentRecords = parsed.records;
    parse = {
      rowCount: parsed.rowCount,
      notes: parsed.notes,
    };
  }

  const reconciliation = reconcileDues(members, paymentRecords);

  return {
    rosterUpdatedAt: roster.updatedAt,
    file: meta,
    parse,
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
