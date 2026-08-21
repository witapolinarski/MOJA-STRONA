const endpoint = "/.netlify/functions/send-test-voucher";
const passwordInput = document.querySelector("#test-password");
const emailInput = document.querySelector("#test-email");
const recipientInput = document.querySelector("#test-recipient");
const amountInput = document.querySelector("#test-amount");
const visibilityInput = document.querySelector("#test-amount-visibility");
const form = document.querySelector("#voucher-test-form");
const statusEl = document.querySelector("#test-status");
const previewFrame = document.querySelector("#test-preview-frame");
const previewButton = document.querySelector("#test-preview");

const savedPasswordKey = "strzelamVoucherTestPassword";
const savedEmailKey = "strzelamVoucherTestEmail";

const setStatus = (message, isError = false) => {
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
};

const getPayload = (preview = false) => ({
  password: passwordInput?.value || "",
  email: emailInput?.value.trim() || "",
  recipient: recipientInput?.value.trim() || "Osoba testowa",
  amount: Number(amountInput?.value || 500),
  amountVisibility: visibilityInput?.value || "hidden",
  preview,
});

const savePreferences = () => {
  if (passwordInput?.value) {
    sessionStorage.setItem(savedPasswordKey, passwordInput.value);
  }
  if (emailInput?.value) {
    localStorage.setItem(savedEmailKey, emailInput.value.trim());
  }
};

const restorePreferences = () => {
  const savedPassword = sessionStorage.getItem(savedPasswordKey);
  const savedEmail = localStorage.getItem(savedEmailKey);
  if (savedPassword && passwordInput) passwordInput.value = savedPassword;
  if (savedEmail && emailInput) emailInput.value = savedEmail;
};

const callTestEndpoint = async (preview = false) => {
  savePreferences();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(getPayload(preview)),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Nie udało się wykonać testu bonu.");
  }

  return result;
};

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (previewFrame) previewFrame.hidden = true;
  setStatus("Wysyłam testowy bon...");

  try {
    const result = await callTestEndpoint(false);
    const copyHint = result.copyEmail
      ? ` Kopia: ${result.copyEmail}.`
      : " Sprawdź też folder Spam/Oferty.";
    setStatus(
      `${result.message || "Wysłano testowy bon."}${copyHint} Id wysyłki: ${result.emailId || "-"}.`,
    );
  } catch (error) {
    setStatus(error.message || "Nie udało się wysłać testowego bonu.", true);
  }
});

previewButton?.addEventListener("click", async () => {
  setStatus("Przygotowuję podgląd HTML...");

  try {
    const result = await callTestEndpoint(true);
    if (!previewFrame) return;

    previewFrame.hidden = false;
    previewFrame.srcdoc = result.html || "";
    setStatus("Podgląd HTML gotowy — bez wysyłki e-maila.");
  } catch (error) {
    if (previewFrame) previewFrame.hidden = true;
    setStatus(error.message || "Nie udało się wygenerować podglądu.", true);
  }
});

restorePreferences();
