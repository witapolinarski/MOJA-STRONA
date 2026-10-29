// Klub poprawia regulamin po uwadze związku i ponownie zgłasza zawody.
import { jsonResponse, requireKlub } from "./lib/auth.mjs";
import { addRegulationVersion, STATUSES, transitionStatus } from "./lib/competitions.mjs";
import { getCompetition, saveCompetition } from "./lib/competitions-store.mjs";
import { saveFile } from "./lib/store.mjs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default async (request) => {
  const auth = requireKlub(request);
  if (!auth.ok) return auth.response;
  if (request.method !== "POST") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const formData = await request.formData();
    const id = formData.get("id");
    const tekst = formData.get("tekst") || "";

    const competition = await getCompetition(id);
    if (!competition) return jsonResponse({ error: "Nie znaleziono zawodów." }, 404);
    if (competition.klubId !== auth.klubId) {
      return jsonResponse({ error: "Brak dostępu do tych zawodów." }, 403);
    }

    let next = competition;
    const regulamin = formData.get("regulamin");
    if (regulamin && typeof regulamin !== "string" && regulamin.size > 0) {
      if (regulamin.size > MAX_FILE_SIZE) {
        return jsonResponse({ error: "Regulamin jest zbyt duży (maks. 10 MB)." }, 400);
      }
      const fileMeta = await saveFile(competition.id, "regulamin", regulamin);
      next = addRegulationVersion(next, fileMeta);
    }

    next = transitionStatus(next, STATUSES.ZGLOSZONE, { autor: "klub", tekst });
    await saveCompetition(next);

    return jsonResponse({ ok: true, competition: next });
  } catch (error) {
    if (error?.name === "InvalidTransitionError") {
      return jsonResponse({ error: error.message }, 409);
    }
    console.error(error);
    return jsonResponse({ error: "Błąd ponownego zgłoszenia zawodów." }, 500);
  }
};
