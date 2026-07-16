import { jsonResponse } from "./lib/auth.mjs";
import { ensureRosterSeeded, matchRecommender } from "./lib/roster.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  try {
    const body = await request.json();
    const recommender = String(body.recommender || "").trim();

    if (!recommender) {
      return jsonResponse({ valid: false, error: "Podaj imię i nazwisko osoby rekomendującej." }, 400);
    }

    await ensureRosterSeeded();
    const member = await matchRecommender(recommender);

    if (!member) {
      return jsonResponse({
        valid: false,
        error: "Nie znaleziono członka klubu o tym nazwisku w bazie PZSS.",
      });
    }

    return jsonResponse({
      valid: true,
      matchedName: member.displayName || member.fullName,
      lastName: member.lastName,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się zweryfikować rekomendacji." }, 500);
  }
};
