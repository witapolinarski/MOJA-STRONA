// Pobranie pliku regulaminu powiązanego z zawodami, z kontrolą dostępu:
// biuro — zawsze, klub — tylko własne zawody, publicznie — tylko gdy zawody
// są już zaakceptowane albo zrealizowane.
import { detectRole } from "./lib/auth.mjs";
import { filterForPublic } from "./lib/competitions.mjs";
import { getCompetition } from "./lib/competitions-store.mjs";
import { getFile } from "./lib/store.mjs";

export default async (request) => {
  if (request.method !== "GET") {
    return new Response("Metoda niedozwolona.", { status: 405 });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const competitionId = key.split("/")[0];

  const competition = await getCompetition(competitionId);
  if (!competition) return new Response("Nie znaleziono zawodów.", { status: 404 });

  const { role, klubId } = detectRole(request);
  const isOwner = role === "klub" && klubId === competition.klubId;
  const isPublicVisible = filterForPublic([competition]).length > 0;

  if (role !== "biuro" && !isOwner && !isPublicVisible) {
    return new Response("Brak dostępu do tego pliku.", { status: 403 });
  }

  const file = await getFile(key);
  if (!file) return new Response("Nie znaleziono pliku.", { status: 404 });

  return new Response(file.data, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
};
