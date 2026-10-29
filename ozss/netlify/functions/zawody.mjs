import { detectRole, jsonResponse, requireKlub } from "./lib/auth.mjs";
import { getClub } from "./lib/clubs.mjs";
import {
  addRegulationVersion,
  createCompetitionRecord,
  filterForKlub,
  filterForPublic,
  groupByYear,
  validateCompetitionInput,
} from "./lib/competitions.mjs";
import { listCompetitions, nextCompetitionId, saveCompetition } from "./lib/competitions-store.mjs";
import { saveFile } from "./lib/store.mjs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default async (request) => {
  if (request.method === "GET") {
    try {
      const { role, klubId } = detectRole(request);
      const url = new URL(request.url);
      const rok = url.searchParams.get("rok");

      let competitions = await listCompetitions();

      if (role === "biuro") {
        // biuro widzi wszystko
      } else if (role === "klub") {
        const own = filterForKlub(competitions, klubId);
        const ownIds = new Set(own.map((item) => item.id));
        competitions = [...filterForPublic(competitions).filter((item) => !ownIds.has(item.id)), ...own];
      } else {
        competitions = filterForPublic(competitions);
      }

      if (rok) competitions = competitions.filter((item) => String(item.rok) === String(rok));

      return jsonResponse({ groups: groupByYear(competitions) });
    } catch (error) {
      console.error(error);
      return jsonResponse({ error: "Błąd wczytywania kalendarza." }, 500);
    }
  }

  if (request.method === "POST") {
    const auth = requireKlub(request);
    if (!auth.ok) return auth.response;

    try {
      const formData = await request.formData();
      const input = {
        nazwa: formData.get("nazwa"),
        dyscypliny: formData.getAll("dyscyplina"),
        terminOd: formData.get("terminOd"),
        terminDo: formData.get("terminDo"),
        miejsce: formData.get("miejsce"),
        opis: formData.get("opis"),
      };

      const errors = validateCompetitionInput(input);
      if (errors.length) return jsonResponse({ error: errors.join(" ") }, 400);

      const klub = await getClub(auth.klubId);
      if (!klub) return jsonResponse({ error: "Nie znaleziono klubu zgłaszającego." }, 404);

      let competition = createCompetitionRecord({ id: nextCompetitionId(), input, klub });

      const regulamin = formData.get("regulamin");
      if (regulamin && typeof regulamin !== "string" && regulamin.size > 0) {
        if (regulamin.size > MAX_FILE_SIZE) {
          return jsonResponse({ error: "Regulamin jest zbyt duży (maks. 10 MB)." }, 400);
        }
        const fileMeta = await saveFile(competition.id, "regulamin", regulamin);
        competition = addRegulationVersion(competition, fileMeta);
      }

      await saveCompetition(competition);
      return jsonResponse({ ok: true, competition }, 201);
    } catch (error) {
      console.error(error);
      return jsonResponse({ error: "Błąd zgłaszania zawodów." }, 500);
    }
  }

  return jsonResponse({ error: "Metoda niedozwolona." }, 405);
};
