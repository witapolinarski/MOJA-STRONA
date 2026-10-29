// Klub wpisuje / poprawia obsadę organizacyjną zawodów wymaganą przez regulamin
// PZSS (sędzia główny, sekretarz zawodów, kierownik strzelania itd.). To klub —
// nie biuro związku — zna te osoby, więc może to zrobić zarówno przy zgłaszaniu,
// jak i później, gdy obsada się wyjaśni. Inne niż zawody-obsada.mjs, które
// przypisuje biuro z rejestru sędziów związkowych.
import { jsonResponse, requireKlub } from "./lib/auth.mjs";
import { setObsadaPzss } from "./lib/competitions.mjs";
import { getCompetition, saveCompetition } from "./lib/competitions-store.mjs";

export default async (request) => {
  const auth = requireKlub(request);
  if (!auth.ok) return auth.response;
  if (request.method !== "PATCH") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const { id, obsadaPzss } = await request.json();

    const competition = await getCompetition(id);
    if (!competition) return jsonResponse({ error: "Nie znaleziono zawodów." }, 404);
    if (competition.klubId !== auth.klubId) {
      return jsonResponse({ error: "Brak dostępu do tych zawodów." }, 403);
    }

    const next = setObsadaPzss(competition, obsadaPzss);
    await saveCompetition(next);

    return jsonResponse({ ok: true, competition: next });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd zapisu obsady zawodów." }, 500);
  }
};
