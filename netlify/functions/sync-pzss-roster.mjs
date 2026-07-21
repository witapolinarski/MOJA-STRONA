import { jsonResponse } from "./lib/auth.mjs";
import { runPzssRosterSync } from "./lib/roster-sync.mjs";

export default async (request) => {
  const event = await request.json().catch(() => ({}));

  if (event?.source !== "netlify-scheduled-function") {
    return jsonResponse({ error: "Dozwolone wyłącznie jako zadanie harmonogramu." }, 403);
  }

  try {
    const saved = await runPzssRosterSync({
      importedBy: "harmonogram",
      source: "pzss-scheduled",
    });

    return jsonResponse({
      ok: true,
      memberCount: saved.memberCount,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error.message || "Błąd harmonogramu synchronizacji PZSS." }, 500);
  }
};

export const config = {
  schedule: "0 5 * * *",
};
