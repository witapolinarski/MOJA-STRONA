import { jsonResponse, requireMember } from "./lib/auth.mjs";
import { getApplication } from "./lib/store.mjs";

const polishMonths = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

const formatPolishDate = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getDate()} ${polishMonths[value.getMonth()]} ${value.getFullYear()} r.`;
};

const buildCertificateBody = (application) => {
  const honorific = application.honorific === "pani" ? "Pani" : "Pan";
  const membershipWord = application.honorific === "pani" ? "członkinią" : "członkiem";
  const licenseYear = new Date().getFullYear();

  return `Zaświadcza się, że ${honorific} ${application.name}, PESEL ${application.pesel} - jest ${membershipWord} stowarzyszenia „Towarzystwo Miłośników Strzelectwa SAGITTARIUS”. Stowarzyszenie prowadzi działalność statutową w zakresie uprawiania i propagowania strzelectwa sportowego i kolekcjonerstwa broni. Zarejestrowane jest w KRS pod numerem 0000591210. Posiada aktualną licencję klubową Polskiego Związku Strzelectwa Sportowego ${licenseYear} r. w zakresie pistolet, karabin, strzelba.`;
};

export default async (request) => {
  const auth = requireMember(request);
  if (!auth.ok) return auth.response;

  try {
    const application = await getApplication(auth.code);
    if (!application || application.status !== "approved") {
      return jsonResponse({ error: "Brak dostępu do strefy klubowej." }, 403);
    }

    const issueDate = new Date();

    return jsonResponse({
      member: {
        name: application.name,
        pesel: application.pesel,
        honorific: application.honorific || "pan",
        email: application.email,
        code: application.code,
      },
      certificate: {
        ledgerRef: application.ledgerRef || `—/${issueDate.getFullYear()}`,
        issuePlace: "Izbicko",
        issueDate: formatPolishDate(issueDate),
        body: buildCertificateBody(application),
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się pobrać danych członka." }, 500);
  }
};
