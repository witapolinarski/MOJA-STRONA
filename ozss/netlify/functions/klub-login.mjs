import { createKlubToken, jsonResponse } from "./lib/auth.mjs";
import { toPublicClub, verifyClubLogin } from "./lib/clubs.mjs";

export default async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const { klubId, password } = await request.json();
    const klub = await verifyClubLogin(String(klubId || "").trim(), password);
    if (!klub) {
      return jsonResponse({ error: "Nieprawidłowy kod klubu lub hasło." }, 401);
    }

    return jsonResponse({ ok: true, token: createKlubToken(klub.id), klub: toPublicClub(klub) });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd logowania." }, 500);
  }
};
