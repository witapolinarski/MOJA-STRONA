const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

const membershipForm = document.querySelector("#membership-form");
const formNote = document.querySelector("#form-note");
const submitButton = document.querySelector("#membership-submit");
const applicationCodeField = document.querySelector("#application-code");
const criminalRecordWrap = document.querySelector("#criminal-record-wrap");
const criminalRecordInput = document.querySelector("#member-criminal-record");
const checklistCriminal = document.querySelector("#checklist-criminal");

const fields = {
  name: document.querySelector("#member-name"),
  email: document.querySelector("#member-email"),
  phone: document.querySelector("#member-phone"),
  address: document.querySelector("#member-address"),
  type: document.querySelector("#member-type"),
  section: document.querySelector("#member-section"),
  recommender: document.querySelector("#member-recommender"),
  exempt: document.querySelector("#member-exempt"),
  statute: document.querySelector("#member-statute"),
  rodo: document.querySelector("#member-rodo"),
  declaration: document.querySelector("#member-declaration"),
  paymentProof: document.querySelector("#member-payment"),
};

const preview = {
  name: document.querySelector("#preview-name"),
  email: document.querySelector("#preview-email"),
  type: document.querySelector("#preview-type"),
  section: document.querySelector("#preview-section"),
  recommender: document.querySelector("#preview-recommender"),
  code: document.querySelector("#preview-code"),
};

const typeLabels = {
  zwyczajne: "Członkostwo zwyczajne",
  mlodsze: "Członkostwo młodsze",
  wspierajace: "Członkostwo wspierające",
};

const sectionLabels = {
  sportowa: "Sekcja sportowa",
  kolekcjonerska: "Sekcja kolekcjonerska",
  szkoleniowa: "Sekcja szkoleniowa",
};

const isLocalPreview =
  window.location.protocol === "file:" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const getApplicationCode = () => {
  let code = sessionStorage.getItem("sagittariusAppCode");

  if (!code) {
    const timestampPart = Date.now().toString(36).slice(-4).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    code = `SG-${timestampPart}-${randomPart}`;
    sessionStorage.setItem("sagittariusAppCode", code);
  }

  return code;
};

const updateCriminalRequirement = () => {
  const isExempt = fields.exempt?.checked;

  if (criminalRecordInput) {
    criminalRecordInput.required = !isExempt;
    if (isExempt) criminalRecordInput.value = "";
  }

  if (criminalRecordWrap) {
    criminalRecordWrap.classList.toggle("is-muted", isExempt);
  }

  if (checklistCriminal) {
    checklistCriminal.classList.toggle("done", isExempt);
    checklistCriminal.textContent = isExempt
      ? "Zaświadczenie o niekaralności — zwolnienie"
      : "Zaświadczenie o niekaralności (max 30 dni)";
  }
};

const updatePreview = () => {
  const name = fields.name?.value.trim() || "—";
  const email = fields.email?.value.trim() || "—";
  const type = fields.type?.value || "zwyczajne";
  const section = fields.section?.value || "sportowa";
  const recommender = fields.recommender?.value.trim() || "—";
  const code = getApplicationCode();

  if (preview.name) preview.name.textContent = name;
  if (preview.email) preview.email.textContent = email;
  if (preview.type) preview.type.textContent = typeLabels[type] || type;
  if (preview.section) preview.section.textContent = sectionLabels[section] || section;
  if (preview.recommender) preview.recommender.textContent = recommender;
  if (preview.code) preview.code.textContent = code;
  if (applicationCodeField) applicationCodeField.value = code;

  updateCriminalRequirement();
};

const getFormData = () => ({
  code: getApplicationCode(),
  name: fields.name?.value.trim() || "",
  email: fields.email?.value.trim() || "",
  phone: fields.phone?.value.trim() || "",
  address: fields.address?.value.trim() || "",
  type: typeLabels[fields.type?.value || "zwyczajne"] || fields.type?.value || "",
  section: sectionLabels[fields.section?.value || "sportowa"] || fields.section?.value || "",
  recommender: fields.recommender?.value.trim() || "",
  exempt: fields.exempt?.checked,
  submittedAt: new Date().toISOString(),
});

const validateForm = () => {
  if (!membershipForm?.checkValidity()) {
    membershipForm?.reportValidity();
    return false;
  }

  if (!fields.statute?.checked || !fields.rodo?.checked) {
    if (formNote) {
      formNote.textContent = "Zaakceptuj statut i zgodę RODO, aby wysłać wniosek.";
      formNote.classList.remove("success");
    }
    return false;
  }

  if (!fields.declaration?.files?.length) {
    setFormMessage("Dołącz podpisaną deklarację członkowską.");
    return false;
  }

  if (!fields.paymentProof?.files?.length) {
    setFormMessage("Dołącz dowód wpłaty wpisowego.");
    return false;
  }

  if (!fields.exempt?.checked && !criminalRecordInput?.files?.length) {
    setFormMessage("Dołącz zaświadczenie o niekaralności lub zaznacz zwolnienie.");
    return false;
  }

  return true;
};

const buildSubmissionFormData = (data) => {
  const formData = new FormData(membershipForm);
  formData.set("application-code", data.code);
  formData.set("exempt", data.exempt ? "tak" : "nie");
  formData.set("statute", fields.statute?.checked ? "tak" : "nie");
  formData.set("rodo", fields.rodo?.checked ? "tak" : "nie");
  return formData;
};

const setFormMessage = (message, isSuccess = false) => {
  if (!formNote) return;
  formNote.textContent = message;
  formNote.classList.toggle("success", isSuccess);
};

const handleSubmit = async (event) => {
  event.preventDefault();
  updatePreview();

  if (!validateForm()) return;

  const data = getFormData();

  if (isLocalPreview) {
    localStorage.setItem("pendingMembership", JSON.stringify(data));
    setFormMessage(
      `Tryb lokalny: wniosek ${data.code} nie został wysłany. Wdróż stronę na Netlify, aby zapisać dokumenty w panelu administratora.`,
      true,
    );
    return;
  }

  if (submitButton) submitButton.disabled = true;
  setFormMessage("Wysyłanie wniosku i dokumentów…");

  try {
    const response = await fetch("/.netlify/functions/submit-application", {
      method: "POST",
      body: buildSubmissionFormData(data),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    localStorage.setItem("pendingMembership", JSON.stringify(data));
    window.location.href = `/success.html?code=${encodeURIComponent(data.code)}`;
  } catch (error) {
    console.error(error);
    setFormMessage(error.message || "Nie udało się wysłać wniosku. Spróbuj ponownie.");
    if (submitButton) submitButton.disabled = false;
  }
};

if (membershipForm) {
  updatePreview();

  Object.values(fields).forEach((field) => {
    field?.addEventListener("input", updatePreview);
    field?.addEventListener("change", updatePreview);
  });

  membershipForm.addEventListener("submit", handleSubmit);
}
