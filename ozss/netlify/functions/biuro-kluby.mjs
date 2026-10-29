import { jsonResponse, requireBiuro } from "./lib/auth.mjs";
import { createClub, listClubs, toPublicClub, updateClub } from "./lib/clubs.mjs";

export default async (request) => {
  const auth = requireBiuro(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const clubs = await listClubs();
      return jsonResponse({ clubs: clubs.map(toPublicClub) });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const { nazwa, miejscowosc, kontaktEmail, kontaktTelefon, password } = body;

      if (!String(nazwa || "").trim()) {
        return jsonResponse({ error: "Podaj nazwę klubu." }, 400);
      }
      if (!String(password || "").trim() || String(password).length < 6) {
        return jsonResponse({ error: "Hasło klubu musi mieć co najmniej 6 znaków." }, 400);
      }

      const club = await createClub({ nazwa, miejscowosc, kontaktEmail, kontaktTelefon, password });
      return jsonResponse({ ok: true, club: toPublicClub(club) }, 201);
    }

    if (request.method === "PATCH") {
      const body = await request.json();
      const { id, ...patch } = body;
      if (!id) return jsonResponse({ error: "Brak identyfikatora klubu." }, 400);

      if (patch.password && String(patch.password).length < 6) {
        return jsonResponse({ error: "Hasło klubu musi mieć co najmniej 6 znaków." }, 400);
      }

      const club = await updateClub(id, patch);
      if (!club) return jsonResponse({ error: "Nie znaleziono klubu." }, 404);

      return jsonResponse({ ok: true, club: toPublicClub(club) });
    }

    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd zarządzania klubami." }, 500);
  }
};
