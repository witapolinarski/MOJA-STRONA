import { jsonResponse } from "./lib/auth.mjs";
import { isValidPesel, normalizePesel } from "./lib/pesel.mjs";
import { saveApplication, saveFile } from "./lib/store.mjs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const requiredFields = [
  "application-code",
  "name",
  "email",
  "phone",
  "address",
  "pesel",
  "honorific",
  "type",
  "recommender",
];

const validateFile = (file, label) => {
  if (!file || typeof file === "string" || file.size === 0) {
    return `${label} jest wymagany.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `${label} jest zbyt duży (maks. 8 MB).`;
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return `${label}: dozwolone formaty to PDF, JPG i PNG.`;
  }
  return null;
};

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  try {
    const formData = await request.formData();

    if (formData.get("bot-field")) {
      return jsonResponse({ error: "Odrzucono zgłoszenie." }, 400);
    }

    for (const field of requiredFields) {
      if (!String(formData.get(field) || "").trim()) {
        return jsonResponse({ error: `Brakuje pola: ${field}` }, 400);
      }
    }

    if (formData.get("statute") !== "tak" || formData.get("rodo") !== "tak") {
      return jsonResponse({ error: "Wymagana akceptacja statutu i RODO." }, 400);
    }

    const declaration = formData.get("declaration");
    const paymentProof = formData.get("payment-proof");

    const declarationError = validateFile(declaration, "Deklaracja członkowska");
    if (declarationError) return jsonResponse({ error: declarationError }, 400);

    const paymentError = validateFile(paymentProof, "Dowód wpłaty");
    if (paymentError) return jsonResponse({ error: paymentError }, 400);

    const code = String(formData.get("application-code")).trim();
    const pesel = normalizePesel(formData.get("pesel"));
    const honorific = String(formData.get("honorific") || "").trim().toLowerCase();
    const exempt = formData.get("exempt") === "tak";
    const criminalDeclaration = formData.get("criminal-declaration") === "tak";

    if (!isValidPesel(pesel)) {
      return jsonResponse({ error: "Podaj prawidłowy numer PESEL." }, 400);
    }

    if (!["pan", "pani"].includes(honorific)) {
      return jsonResponse({ error: "Wybierz formę zwracania się: Pan lub Pani." }, 400);
    }

    if (!exempt && !criminalDeclaration) {
      return jsonResponse({ error: "Wymagana akceptacja oświadczenia o niekaralności." }, 400);
    }

    const application = {
      code,
      status: "pending",
      name: String(formData.get("name")).trim(),
      email: String(formData.get("email")).trim(),
      phone: String(formData.get("phone")).trim(),
      address: String(formData.get("address")).trim(),
      pesel,
      honorific,
      type: String(formData.get("type")).trim(),
      section: "",
      recommender: String(formData.get("recommender")).trim(),
      exempt,
      criminalDeclaration,
      criminalDeclarationAt: criminalDeclaration ? new Date().toISOString() : null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewNote: "",
      files: {},
    };

    application.files.declaration = await saveFile(code, "declaration", declaration);
    application.files.paymentProof = await saveFile(code, "payment-proof", paymentProof);

    await saveApplication(application);

    return jsonResponse({ ok: true, code, status: "pending" }, 201);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się zapisać wniosku." }, 500);
  }
};
