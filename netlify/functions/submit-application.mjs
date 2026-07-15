import { jsonResponse } from "./lib/auth.mjs";
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
  "type",
  "section",
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
    const criminalRecord = formData.get("criminal-record");
    const exempt = formData.get("exempt") === "tak";

    if (!exempt) {
      const criminalError = validateFile(criminalRecord, "Zaświadczenie o niekaralności");
      if (criminalError) return jsonResponse({ error: criminalError }, 400);
    }

    const application = {
      code,
      status: "pending",
      name: String(formData.get("name")).trim(),
      email: String(formData.get("email")).trim(),
      phone: String(formData.get("phone")).trim(),
      address: String(formData.get("address")).trim(),
      type: String(formData.get("type")).trim(),
      section: String(formData.get("section")).trim(),
      recommender: String(formData.get("recommender")).trim(),
      exempt,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewNote: "",
      files: {},
    };

    application.files.declaration = await saveFile(code, "declaration", declaration);
    application.files.paymentProof = await saveFile(code, "payment-proof", paymentProof);

    if (!exempt && criminalRecord && criminalRecord.size > 0) {
      application.files.criminalRecord = await saveFile(code, "criminal-record", criminalRecord);
    }

    await saveApplication(application);

    return jsonResponse({ ok: true, code, status: "pending" }, 201);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się zapisać wniosku." }, 500);
  }
};
