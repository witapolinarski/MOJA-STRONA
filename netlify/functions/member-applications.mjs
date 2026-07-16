import { jsonResponse } from "./lib/auth.mjs";
import { requireApprover } from "./lib/approvers.mjs";
import { getPaymentRecord } from "./lib/payments.mjs";
import { getApplication, getNextLedgerNumber, listApplications, saveApplication } from "./lib/store.mjs";

const enrichApplication = async (application) => {
  if (!application?.payment) {
    const payment = await getPaymentRecord(application.code);
    if (payment) application.payment = payment;
  }
  return application;
};

export default async (request) => {
  const auth = await requireApprover(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "pending";

      let applications = await listApplications();
      if (status !== "all") {
        applications = applications.filter((item) => item.status === status);
      }

      applications = await Promise.all(applications.map((item) => enrichApplication(item)));

      return jsonResponse({ applications, approver: auth.member.name });
    }

    if (request.method === "PATCH") {
      const body = await request.json();
      const { code, status, reviewNote = "" } = body;

      if (!code || !["approved", "rejected", "pending"].includes(status)) {
        return jsonResponse({ error: "Nieprawidłowe dane aktualizacji." }, 400);
      }

      const application = await getApplication(code);
      if (!application) return jsonResponse({ error: "Nie znaleziono wniosku." }, 404);

      application.status = status;
      application.reviewedAt = status === "pending" ? null : new Date().toISOString();
      application.reviewedBy = status === "pending" ? null : auth.member.name;
      application.reviewNote = String(reviewNote || "").trim();

      if (status === "approved" && !application.ledgerRef) {
        application.ledgerRef = await getNextLedgerNumber();
      }

      await saveApplication(application);
      return jsonResponse({ ok: true, application });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd obsługi wniosków." }, 500);
  }
};
