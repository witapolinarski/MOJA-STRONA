// Biuro przypisuje obsadę sędziowską: sędzia główny, delegat techniczny, obserwator.
import { jsonResponse, requireBiuro } from "./lib/auth.mjs";
import { assignObsada } from "./lib/competitions.mjs";
import { getCompetition, saveCompetition } from "./lib/competitions-store.mjs";
import { getJudge } from "./lib/judges.mjs";

const resolveJudge = async (id) => {
  if (!id) return null;
  const judge = await getJudge(id);
  if (!judge) return null;
  return { id: judge.id, imieNazwisko: `${judge.imie} ${judge.nazwisko}`.trim() };
};

export default async (request) => {
  const auth = requireBiuro(request);
  if (!auth.ok) return auth.response;
  if (request.method !== "PATCH") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const { id, sedziaGlowny, delegatTechniczny, obserwator } = await request.json();

    const competition = await getCompetition(id);
    if (!competition) return jsonResponse({ error: "Nie znaleziono zawodów." }, 404);

    const obsada = {};
    if (sedziaGlowny !== undefined) obsada.sedziaGlowny = await resolveJudge(sedziaGlowny);
    if (delegatTechniczny !== undefined) obsada.delegatTechniczny = await resolveJudge(delegatTechniczny);
    if (obserwator !== undefined) obsada.obserwator = await resolveJudge(obserwator);

    const next = assignObsada(competition, obsada);
    await saveCompetition(next);

    return jsonResponse({ ok: true, competition: next });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd przypisania obsady sędziowskiej." }, 500);
  }
};
