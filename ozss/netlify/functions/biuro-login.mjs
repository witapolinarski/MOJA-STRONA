import { createBiuroToken, jsonResponse, verifyBiuroPassword } from "./lib/auth.mjs";

export default async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Metoda niedozwolona." }, 405);

  try {
    const { password } = await request.json();
    if (!verifyBiuroPassword(password)) {
      return jsonResponse({ error: "Nieprawidłowe hasło biura związku." }, 401);
    }

    return jsonResponse({ ok: true, token: createBiuroToken() });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd logowania." }, 500);
  }
};
