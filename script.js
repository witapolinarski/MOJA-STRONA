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
};

const preview = {
  name: document.querySelector("#preview-name"),
  email: document.querySelector("#preview-email"),
  type: document.querySelector("#preview-type"),
  section: document.querySelector("#preview-section"),
  recommender: document.querySelector("#preview-recommender"),
  code: document.querySelector("#preview-code"),
};

const checklist = document.querySelector("#preview-checklist");

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

const updateChecklist = () => {
  if (!checklist) return;

  const isExempt = fields.exempt?.checked;
  const items = checklist.querySelectorAll("li");

  if (items[0]) {
    items[0].classList.toggle("done", isExempt);
    items[0].textContent = isExempt
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

  if (preview.name) preview.name.textContent = name;
  if (preview.email) preview.email.textContent = email;
  if (preview.type) preview.type.textContent = typeLabels[type] || type;
  if (preview.section) preview.section.textContent = sectionLabels[section] || section;
  if (preview.recommender) preview.recommender.textContent = recommender;
  if (preview.code) preview.code.textContent = getApplicationCode();

  updateChecklist();
};

const getFormData = () => ({
  code: getApplicationCode(),
  name: fields.name?.value.trim() || "",
  email: fields.email?.value.trim() || "",
  phone: fields.phone?.value.trim() || "",
  address: fields.address?.value.trim() || "",
  type: fields.type?.value || "",
  section: fields.section?.value || "",
  recommender: fields.recommender?.value.trim() || "",
  exempt: fields.exempt?.checked || false,
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

  return true;
};

const handleSubmit = (event) => {
  event.preventDefault();
  updatePreview();

  if (!validateForm()) return;

  const data = getFormData();
  localStorage.setItem("pendingMembership", JSON.stringify(data));

  if (submitButton) submitButton.disabled = true;

  if (formNote) {
    formNote.textContent = `Wniosek ${data.code} zapisany lokalnie (tryb prototypu). Podłącz backend (Netlify Forms / Formspree / własny API), aby wysyłać wnioski do zarządu i generować PDF.`;
    formNote.classList.add("success");
  }

  setTimeout(() => {
    if (submitButton) submitButton.disabled = false;
  }, 1500);
};

if (membershipForm) {
  updatePreview();

  Object.values(fields).forEach((field) => {
    field?.addEventListener("input", updatePreview);
    field?.addEventListener("change", updatePreview);
  });

  membershipForm.addEventListener("submit", handleSubmit);
}
