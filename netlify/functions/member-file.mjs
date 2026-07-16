import { requireApprover } from "./lib/approvers.mjs";
import { getFile } from "./lib/store.mjs";

export default async (request) => {
  const auth = await requireApprover(request);
  if (!auth.ok) return auth.response;

  if (request.method !== "GET") {
    return new Response("Metoda niedozwolona.", { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const field = url.searchParams.get("field");

    if (!code || !field) {
      return new Response("Brak parametrów code lub field.", { status: 400 });
    }

    const file = await getFile(code, field);
    if (!file) return new Response("Plik nie istnieje.", { status: 404 });

    return new Response(file.data, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${file.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Błąd pobierania pliku.", { status: 500 });
  }
};
