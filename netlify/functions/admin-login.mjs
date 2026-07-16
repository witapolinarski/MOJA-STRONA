import { createAdminToken, jsonResponse, verifyAdminPassword } from "./lib/auth.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  try {
    const { password } = await request.json();

    if (!verifyAdminPassword(password)) {
      return jsonResponse({ error: "Nieprawidłowe hasło administratora." }, 401);
    }

    const token = createAdminToken();
    return jsonResponse({
      ok: true,
      token,
      admin: {
        name: process.env.ADMIN_NAME || "Witold Apolinarski",
        email: process.env.ADMIN_EMAIL || "apolinarski@yahoo.com",
        role: "Prezes zarządu — zatwierdzanie wniosków",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Błąd logowania." }, 500);
  }
};
