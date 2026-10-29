// Biuro związku: zatwierdzenie zgłoszenia, odesłanie z uwagą albo odwołanie zawodów.
import { jsonResponse, requireBiuro } from "./lib/auth.mjs";
import { STATUSES, transitionStatus } from "./lib/competitions.mjs";
import { getCompetition, saveCompetition } from "./lib/competitions-store.mjs";

const ALLOWED_TARGETS = new Set([
  STATUSES.ZAAKCEPTOWANE,
  STATUSES.DO_POPRAWY,
  STATUSES.ODWOLANE,
]);

export default async (request) => {
  const auth = requireBiuro(request);
  if (!auth.ok) return auth.response;
  if (request.method !== "PATCH") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const { id, status, tekst = "" } = await request.json();

    if (!id || !ALLOWED_TARGETS.has(status)) {
      return jsonResponse({ error: "Nieprawidłowe dane żądania." }, 400);
    }

    if (status === STATUSES.DO_POPRAWY && !String(tekst).trim()) {
      return jsonResponse({ error: "Odesłanie do poprawy wymaga uwagi dla klubu." }, 400);
    }

    const competition = await getCompetition(id);
    if (!competition) return jsonResponse({ error: "Nie znaleziono zawodów." }, 404);

    const next = transitionStatus(competition, status, { autor: "biuro", tekst });
    await saveCompetition(next);

    return jsonResponse({ ok: true, competition: next });
  } catch (error) {
    if (error?.name === "InvalidTransitionError") {
      return jsonResponse({ error: error.message }, 409);
    }
    console.error(error);
    return jsonResponse({ error: "Błąd zmiany statusu zawodów." }, 500);
  }
};
