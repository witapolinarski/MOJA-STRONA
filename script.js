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
const criminalDeclarationWrap = document.querySelector("#criminal-declaration-wrap");
const criminalDeclarationInput = document.querySelector("#member-criminal-declaration");
const checklistCriminal = document.querySelector("#checklist-criminal");

const fields = {
  name: document.querySelector("#member-name"),
  email: document.querySelector("#member-email"),
  phone: document.querySelector("#member-phone"),
  address: document.querySelector("#member-address"),
  pesel: document.querySelector("#member-pesel"),
  honorific: document.querySelector("#member-honorific"),
  type: document.querySelector("#member-type"),
  recommender: document.querySelector("#member-recommender"),
  exempt: document.querySelector("#member-exempt"),
  criminalDeclaration: document.querySelector("#member-criminal-declaration"),
  statute: document.querySelector("#member-statute"),
  rodo: document.querySelector("#member-rodo"),
  declaration: document.querySelector("#member-declaration"),
  paymentProof: document.querySelector("#member-payment"),
};

const preview = {
  name: document.querySelector("#preview-name"),
  email: document.querySelector("#preview-email"),
  type: document.querySelector("#preview-type"),
  recommender: document.querySelector("#preview-recommender"),
  code: document.querySelector("#preview-code"),
};

const typeLabels = {
  zwyczajne: "Członkostwo zwyczajne",
  mlodsze: "Członkostwo młodsze",
  wspierajace: "Członkostwo wspierające",
};

const isValidPesel = (value) => {
  const pesel = String(value || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(pesel)) return false;

  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;

  for (let index = 0; index < 10; index += 1) {
    sum += Number(pesel[index]) * weights[index];
  }

  return (10 - (sum % 10)) % 10 === Number(pesel[10]);
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

const membershipFees = {
  entryFee: 350,
  monthlyFee: 30,
  bankAccount: "",
  bankName: "",
};

const documentsToggle = document.querySelector("#documents-toggle");
const documentsPanel = document.querySelector("#documents-panel");
const feeAcceptanceDate = document.querySelector("#fee-acceptance-date");
const feeEntryDisplay = document.querySelector("#fee-entry-display");
const feeEntryAmount = document.querySelector("#fee-entry-amount");
const feeMonthsCount = document.querySelector("#fee-months-count");
const feeAnnualAmount = document.querySelector("#fee-annual-amount");
const feeTotalAmount = document.querySelector("#fee-total-amount");
const feeMonthsNote = document.querySelector("#fee-months-note");
const paymentAccount = document.querySelector("#payment-account");
const paymentTitle = document.querySelector("#payment-title");

const formatMoney = (value) =>
  new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(value);

const monthNames = [
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

const countFeeMonths = (acceptanceDate) => {
  const month = acceptanceDate.getMonth();
  const nextMonthIndex = month + 1;
  if (nextMonthIndex > 11) return 0;
  return 12 - nextMonthIndex;
};

const updateFeeCalculator = () => {
  const rawDate = feeAcceptanceDate?.value;
  const acceptanceDate = rawDate ? new Date(`${rawDate}T12:00:00`) : new Date();
  const months = countFeeMonths(acceptanceDate);
  const annualFee = months * membershipFees.monthlyFee;
  const total = membershipFees.entryFee + annualFee;
  const applicantName = fields.name?.value.trim() || "[imię i nazwisko]";
  const code = getApplicationCode();

  if (feeEntryDisplay) feeEntryDisplay.textContent = `${membershipFees.entryFee} zł`;
  if (feeEntryAmount) feeEntryAmount.textContent = formatMoney(membershipFees.entryFee);
  if (feeMonthsCount) feeMonthsCount.textContent = String(months);
  if (feeAnnualAmount) feeAnnualAmount.textContent = formatMoney(annualFee);
  if (feeTotalAmount) feeTotalAmount.textContent = formatMoney(total);

  if (feeMonthsNote) {
    if (months === 0) {
      feeMonthsNote.textContent =
        "Przy przyjęciu w grudniu składka roczna za bieżący rok nie jest naliczana — od stycznia obowiązuje składka miesięczna 30 zł.";
    } else {
      const fromMonth = monthNames[acceptanceDate.getMonth() + 1];
      feeMonthsNote.textContent = `Naliczono ${months} mies. (od ${fromMonth} do grudnia) × 30 zł = ${formatMoney(annualFee)}.`;
    }
  }

  if (paymentAccount) {
    paymentAccount.textContent = membershipFees.bankAccount
      ? `${membershipFees.bankAccount}${membershipFees.bankName ? ` (${membershipFees.bankName})` : ""}`
      : "Skontaktuj się: kontakt@strzelamy.org.pl";
  }

  if (paymentTitle) {
    paymentTitle.textContent = `Wpisowe i składka — ${applicantName} — ${code}`;
  }
};

const updateCriminalRequirement = () => {
  const isExempt = fields.exempt?.checked;

  if (criminalDeclarationInput) {
    criminalDeclarationInput.required = !isExempt;
    if (isExempt) criminalDeclarationInput.checked = false;
  }

  if (criminalDeclarationWrap) {
    criminalDeclarationWrap.classList.toggle("is-muted", isExempt);
  }

  if (checklistCriminal) {
    checklistCriminal.classList.toggle("done", isExempt || fields.criminalDeclaration?.checked);
    checklistCriminal.textContent = isExempt
      ? "Oświadczenie o niekaralności — zwolnienie"
      : "Oświadczenie o niekaralności";
  }
};

const updatePreview = () => {
  const name = fields.name?.value.trim() || "—";
  const email = fields.email?.value.trim() || "—";
  const type = fields.type?.value || "zwyczajne";
  const recommender = fields.recommender?.value.trim() || "—";
  const code = getApplicationCode();

  if (preview.name) preview.name.textContent = name;
  if (preview.email) preview.email.textContent = email;
  if (preview.type) preview.type.textContent = typeLabels[type] || type;
  if (preview.recommender) preview.recommender.textContent = recommender;
  if (preview.code) preview.code.textContent = code;
  if (applicationCodeField) applicationCodeField.value = code;

  updateCriminalRequirement();
  updateFeeCalculator();
};

const getFormData = () => ({
  code: getApplicationCode(),
  name: fields.name?.value.trim() || "",
  email: fields.email?.value.trim() || "",
  phone: fields.phone?.value.trim() || "",
  address: fields.address?.value.trim() || "",
  type: typeLabels[fields.type?.value || "zwyczajne"] || fields.type?.value || "",
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

  if (!fields.exempt?.checked && !fields.criminalDeclaration?.checked) {
    setFormMessage("Zaakceptuj oświadczenie o niekaralności lub zaznacz zwolnienie.");
    return false;
  }

  if (!isValidPesel(fields.pesel?.value)) {
    setFormMessage("Podaj prawidłowy numer PESEL.");
    return false;
  }

  return true;
};

const buildSubmissionFormData = (data) => {
  const formData = new FormData(membershipForm);
  formData.set("application-code", data.code);
  formData.set("exempt", data.exempt ? "tak" : "nie");
  formData.set("criminal-declaration", fields.criminalDeclaration?.checked ? "tak" : "nie");
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

if (documentsToggle && documentsPanel) {
  documentsToggle.addEventListener("click", () => {
    const collapsed = documentsPanel.classList.toggle("is-collapsed");
    documentsToggle.setAttribute("aria-expanded", String(!collapsed));
  });
}

if (feeAcceptanceDate) {
  const today = new Date();
  feeAcceptanceDate.value = today.toISOString().slice(0, 10);
  feeAcceptanceDate.addEventListener("change", updateFeeCalculator);
}

updateFeeCalculator();
