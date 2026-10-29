// Rejestr sędziów. Odczyt dostępny dla biura i klubów (klub widzi, kto
// może być przypisany — np. do podglądu obsady), zapis tylko dla biura.
import { jsonResponse, requireBiuro, requireBiuroOrKlub } from "./lib/auth.mjs";
import { createJudge, listJudges, updateJudge } from "./lib/judges.mjs";

export default async (request) => {
  if (request.method === "GET") {
    const auth = requireBiuroOrKlub(request);
    if (!auth.ok) return auth.response;

    const judges = await listJudges();
    return jsonResponse({ judges });
  }

  const auth = requireBiuro(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "POST") {
      const body = await request.json();
      if (!String(body.imie || "").trim() || !String(body.nazwisko || "").trim()) {
        return jsonResponse({ error: "Podaj imię i nazwisko sędziego." }, 400);
      }

      const judge = await createJudge(body);
      return jsonResponse({ ok: true, judge }, 201);
    }

    if (request.method === "PATCH") {
      const body = await request.json();
      const { id, ...patch } = body;
      if (!id) return jsonResponse({ error: "Brak identyfikatora sędziego." }, 400);

      const judge = await updateJudge(id, patch);
      if (!judge) return jsonResponse({ error: "Nie znaleziono sędziego." }, 404);

      return jsonResponse({ ok: true, judge });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd rejestru sędziów." }, 500);
  }
};
