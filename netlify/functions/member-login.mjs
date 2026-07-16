import { createMemberToken, jsonResponse } from "./lib/auth.mjs";
import { isApproverApplication } from "./lib/approvers.mjs";
import { isValidPesel, normalizePesel } from "./lib/pesel.mjs";
import { findApprovedMember } from "./lib/store.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  try {
    const body = await request.json();
    const email = String(body.email || "").trim();
    const pesel = normalizePesel(body.pesel);

    if (!email || !pesel) {
      return jsonResponse({ error: "Podaj adres e-mail i numer PESEL." }, 400);
    }

    if (!isValidPesel(pesel)) {
      return jsonResponse({ error: "Podaj prawidłowy numer PESEL." }, 400);
    }

    const member = await findApprovedMember(email, pesel);
    if (!member) {
      return jsonResponse(
        {
          error:
            "Brak dostępu. Strefa klubowa jest dostępna wyłącznie dla osób z zaakceptowaną deklaracją członkowską.",
        },
        403,
      );
    }

    return jsonResponse({
      ok: true,
      token: createMemberToken(member.code),
      name: member.name,
      isApprover: isApproverApplication(member),
      role: isApproverApplication(member) ? "Prezes zarządu — akceptacja wniosków" : null,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się zalogować." }, 500);
  }
};
