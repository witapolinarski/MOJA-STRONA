const TOKEN_KEY = "sagittariusAdminToken";
const ADMIN_KEY = "sagittariusAdminProfile";

const loginSection = document.querySelector("#admin-login");
const panelSection = document.querySelector("#admin-panel");
const loginForm = document.querySelector("#login-form");
const loginNote = document.querySelector("#login-note");
const passwordInput = document.querySelector("#admin-password");
const statusFilter = document.querySelector("#status-filter");
const adminList = document.querySelector("#admin-list");
const adminSummary = document.querySelector("#admin-summary");
const adminUser = document.querySelector("#admin-user");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");

const statusLabels = {
  pending: "Oczekuje",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

const typeLabels = {
  zwyczajne: "Członkostwo zwyczajne",
  mlodsze: "Członkostwo młodsze",
  wspierajace: "Członkostwo wspierające",
};

const honorificLabels = {
  pan: "Pan",
  pani: "Pani",
};

const getToken = () => sessionStorage.getItem(TOKEN_KEY) || "";

const setToken = (token) => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
};

const getAdminProfile = () => {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_KEY) || "null");
  } catch {
    return null;
  }
};

const setAdminProfile = (profile) => {
  if (profile) sessionStorage.setItem(ADMIN_KEY, JSON.stringify(profile));
  else sessionStorage.removeItem(ADMIN_KEY);
};

const apiFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    setToken("");
    setAdminProfile(null);
    showLogin();
    throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }

  if (!response.ok) {
    throw new Error(data.error || `Błąd HTTP ${response.status}`);
  }

  return data;
};

const showLogin = () => {
  loginSection?.classList.remove("hidden");
  panelSection?.classList.add("hidden");
};

const showPanel = () => {
  loginSection?.classList.add("hidden");
  panelSection?.classList.remove("hidden");
  const profile = getAdminProfile();
  if (adminUser && profile) {
    adminUser.hidden = false;
    adminUser.textContent = `${profile.name} · ${profile.email} · ${profile.role}`;
  }
};

const formatDate = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatMoney = (value) => {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);
};

const fileUrl = (code, field) =>
  `/.netlify/functions/admin-file?code=${encodeURIComponent(code)}&field=${encodeURIComponent(field)}`;

const renderPaymentSection = (application) => {
  const payment = application.payment || {};
  const hasManualProof = Boolean(application.files?.paymentProof);
  const isStripePaid = payment.status === "paid" && payment.method === "stripe";

  if (isStripePaid) {
    return `
      <section class="admin-section admin-section-payment">
        <h3>Potwierdzenie wpłaty (Stripe)</h3>
        <div class="admin-meta">
          <div>Status: <strong class="payment-paid">Opłacono online</strong></div>
          <div>Kwota: <strong>${formatMoney(payment.amount)}</strong></div>
          <div>Data wpłaty: <strong>${formatDate(payment.paidAt)}</strong></div>
          <div>Metoda: <strong>Stripe (${payment.currency?.toUpperCase() || "PLN"})</strong></div>
          ${payment.stripeSessionId ? `<div>ID sesji: <strong>${payment.stripeSessionId}</strong></div>` : ""}
          ${payment.receiptUrl ? `<div><a href="${payment.receiptUrl}" target="_blank" rel="noopener">Paragon / potwierdzenie Stripe</a></div>` : ""}
        </div>
      </section>
    `;
  }

  if (hasManualProof) {
    return `
      <section class="admin-section admin-section-payment">
        <h3>Potwierdzenie wpłaty (przelew)</h3>
        <div class="admin-meta">
          <div>Status: <strong>Dowód przelewu załączony</strong></div>
          <div>Kwota z kalkulatora: <strong>${formatMoney(application.fees?.total || payment.amount)}</strong></div>
        </div>
        <div class="admin-files">
          <a href="${fileUrl(application.code, "payment-proof")}" target="_blank" rel="noopener">Pobierz dowód wpłaty</a>
        </div>
      </section>
    `;
  }

  return `
    <section class="admin-section admin-section-payment admin-section-warning">
      <h3>Potwierdzenie wpłaty</h3>
      <p class="admin-alert">Brak potwierdzenia wpłaty — kandydat nie opłacił online ani nie załączył dowodu przelewu.</p>
    </section>
  `;
};

const renderApplication = (application) => {
  const card = document.createElement("article");
  card.className = "admin-card";
  const fees = application.fees || {};
  const readyToApprove =
    Boolean(application.files?.declaration) &&
    (application.payment?.status === "paid" || Boolean(application.files?.paymentProof));

  card.innerHTML = `
    <div class="admin-card-header">
      <div>
        <h2>${application.name}</h2>
        <p class="admin-meta"><strong>${application.code}</strong> · ${application.email}</p>
      </div>
      <span class="status-badge ${application.status}">${statusLabels[application.status] || application.status}</span>
    </div>

    <section class="admin-section">
      <h3>Wynik formularza kandydata</h3>
      <dl class="admin-form-result">
        <div><dt>Imię i nazwisko</dt><dd>${application.name}</dd></div>
        <div><dt>E-mail</dt><dd>${application.email}</dd></div>
        <div><dt>Telefon</dt><dd>${application.phone}</dd></div>
        <div><dt>Adres</dt><dd>${application.address}</dd></div>
        <div><dt>PESEL</dt><dd>${application.pesel || "—"}</dd></div>
        <div><dt>Forma</dt><dd>${honorificLabels[application.honorific] || application.honorific || "—"}</dd></div>
        <div><dt>Typ członkostwa</dt><dd>${typeLabels[application.type] || application.type}</dd></div>
        <div><dt>Rekomendacja</dt><dd>${application.recommender}</dd></div>
        <div><dt>Oświadczenie o niekaralności</dt><dd>${application.criminalDeclaration ? "Zaakceptowane" : application.exempt ? "Zwolnienie" : "Brak"}</dd></div>
        <div><dt>Data wniosku</dt><dd>${formatDate(application.submittedAt)}</dd></div>
        <div><dt>Kwota wg kalkulatora</dt><dd>${formatMoney(fees.total || application.payment?.amount)}</dd></div>
      </dl>
    </section>

    <section class="admin-section">
      <h3>Dokumenty do weryfikacji</h3>
      <div class="admin-files">
        ${application.files?.declaration ? `<a href="${fileUrl(application.code, "declaration")}" target="_blank" rel="noopener">Deklaracja członkowska</a>` : `<span class="admin-alert">Brak deklaracji</span>`}
      </div>
    </section>

    ${renderPaymentSection(application)}

    ${!readyToApprove && application.status === "pending" ? `<p class="admin-alert">Uzupełnij weryfikację: wymagana deklaracja i potwierdzona wpłata.</p>` : ""}

    <textarea class="admin-review-note" placeholder="Uwagi dla wniosku (opcjonalnie)" aria-label="Uwagi">${application.reviewNote || ""}</textarea>
    <div class="admin-actions">
      <button type="button" class="button primary" data-action="approved" ${!readyToApprove ? "disabled title='Wymagana deklaracja i potwierdzona wpłata'" : ""}>Zatwierdź kandydata</button>
      <button type="button" class="button dark" data-action="rejected">Odrzuć wniosek</button>
      ${application.status !== "pending" ? `<button type="button" class="button secondary" data-action="pending">Przywróć do oczekujących</button>` : ""}
    </div>
    ${application.reviewedBy ? `<p class="admin-reviewed-by">Rozpatrzył: <strong>${application.reviewedBy}</strong> · ${formatDate(application.reviewedAt)}</p>` : ""}
  `;

  card.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.getAttribute("data-action");
      const reviewNote = card.querySelector(".admin-review-note")?.value || "";

      button.disabled = true;
      try {
        await apiFetch("/.netlify/functions/admin-applications", {
          method: "PATCH",
          body: JSON.stringify({ code: application.code, status, reviewNote }),
        });
        await loadApplications();
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });

  return card;
};

const loadApplications = async () => {
  if (!adminList || !adminSummary) return;

  adminSummary.textContent = "Ładowanie wniosków…";
  adminList.replaceChildren();

  try {
    const status = statusFilter?.value || "pending";
    const data = await apiFetch(`/.netlify/functions/admin-applications?status=${encodeURIComponent(status)}`);
    const applications = data.applications || [];

    adminSummary.textContent =
      applications.length === 0
        ? "Brak wniosków w wybranym statusie."
        : `Liczba wniosków: ${applications.length}`;

    if (applications.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Gdy kandydat wyśle formularz z dokumentami, pojawi się tutaj.";
      adminList.append(empty);
      return;
    }

    applications.forEach((application) => {
      adminList.append(renderApplication(application));
    });
  } catch (error) {
    adminSummary.textContent = error.message;
  }
};

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginNote) loginNote.textContent = "Logowanie…";

  try {
    const data = await fetch("/.netlify/functions/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput?.value || "" }),
    }).then((response) => response.json());

    if (!data.token) {
      throw new Error(data.error || "Nie udało się zalogować.");
    }

    setToken(data.token);
    setAdminProfile(data.admin || null);
    showPanel();
    await loadApplications();
    if (loginNote) loginNote.textContent = "";
    if (passwordInput) passwordInput.value = "";
  } catch (error) {
    if (loginNote) loginNote.textContent = error.message;
  }
});

statusFilter?.addEventListener("change", loadApplications);
refreshButton?.addEventListener("click", loadApplications);
logoutButton?.addEventListener("click", () => {
  setToken("");
  setAdminProfile(null);
  showLogin();
});

if (getToken()) {
  showPanel();
  loadApplications();
} else {
  showLogin();
}
