import { jsonResponse, requireAdmin } from "./lib/auth.mjs";
import { getApplication, getNextLedgerNumber, listApplications, saveApplication } from "./lib/store.mjs";

export default async (request) => {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const status = url.searchParams.get("status");

      if (code) {
        const application = await getApplication(code);
        if (!application) return jsonResponse({ error: "Nie znaleziono wniosku." }, 404);
        return jsonResponse({ application });
      }

      let applications = await listApplications();
      if (status && status !== "all") {
        applications = applications.filter((item) => item.status === status);
      }

      return jsonResponse({ applications });
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
      application.reviewedBy =
        status === "pending" ? null : process.env.ADMIN_NAME || "Witold Apolinarski";
      application.reviewNote = String(reviewNote || "").trim();

      if (status === "approved" && !application.ledgerRef) {
        application.ledgerRef = await getNextLedgerNumber();
      }

      if (status !== "approved") {
        application.ledgerRef = application.ledgerRef || null;
      }

      await saveApplication(application);
      return jsonResponse({ ok: true, application });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd panelu administratora." }, 500);
  }
};
