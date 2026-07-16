import { jsonResponse } from "./lib/auth.mjs";
import { getPaymentRecord } from "./lib/payments.mjs";
import { getApplication } from "./lib/store.mjs";

export default async (request) => {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return jsonResponse({ error: "Brak numeru wniosku." }, 400);
    }

    const application = await getApplication(code);
    const payment = application?.payment || (await getPaymentRecord(code)) || { status: "unpaid" };

    return jsonResponse({
      code,
      payment,
      hasApplication: Boolean(application),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się sprawdzić płatności." }, 500);
  }
};
