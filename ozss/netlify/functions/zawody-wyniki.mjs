// Dodanie wyników zawodów (link) — może to zrobić klub-organizator albo biuro.
// Zawody przechodzą w status "zrealizowane".
import { jsonResponse, requireBiuroOrKlub } from "./lib/auth.mjs";
import { attachResults } from "./lib/competitions.mjs";
import { getCompetition, saveCompetition } from "./lib/competitions-store.mjs";

export default async (request) => {
  const auth = requireBiuroOrKlub(request);
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const { id, link = "", opis = "" } = await request.json();

    const competition = await getCompetition(id);
    if (!competition) return jsonResponse({ error: "Nie znaleziono zawodów." }, 404);

    if (auth.role === "klub" && competition.klubId !== auth.klubId) {
      return jsonResponse({ error: "Brak dostępu do tych zawodów." }, 403);
    }

    if (!String(link).trim()) {
      return jsonResponse({ error: "Podaj link do wyników (np. plik PDF w chmurze)." }, 400);
    }

    const next = attachResults(competition, { link, opis });
    await saveCompetition(next);

    return jsonResponse({ ok: true, competition: next });
  } catch (error) {
    if (error?.name === "InvalidTransitionError") {
      return jsonResponse({ error: error.message }, 409);
    }
    console.error(error);
    return jsonResponse({ error: "Błąd zapisu wyników." }, 500);
  }
};
