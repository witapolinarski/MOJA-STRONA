const TOKEN_KEY = "sagittariusAdminToken";

const loginSection = document.querySelector("#admin-login");
const panelSection = document.querySelector("#admin-panel");
const loginForm = document.querySelector("#login-form");
const loginNote = document.querySelector("#login-note");
const passwordInput = document.querySelector("#admin-password");
const statusFilter = document.querySelector("#status-filter");
const adminList = document.querySelector("#admin-list");
const adminSummary = document.querySelector("#admin-summary");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");

const statusLabels = {
  pending: "Oczekuje",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

const getToken = () => sessionStorage.getItem(TOKEN_KEY) || "";

const setToken = (token) => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
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

const fileUrl = (code, field) =>
  `/.netlify/functions/admin-file?code=${encodeURIComponent(code)}&field=${encodeURIComponent(field)}`;

const renderApplication = (application) => {
  const card = document.createElement("article");
  card.className = "admin-card";
  card.innerHTML = `
    <div class="admin-card-header">
      <div>
        <h2>${application.name}</h2>
        <p class="admin-meta"><strong>${application.code}</strong> · ${application.email}</p>
      </div>
      <span class="status-badge ${application.status}">${statusLabels[application.status] || application.status}</span>
    </div>
    <div class="admin-meta">
      <div>Telefon: <strong>${application.phone}</strong></div>
      <div>Adres: <strong>${application.address}</strong></div>
      <div>PESEL: <strong>${application.pesel || "—"}</strong></div>
      <div>Typ: <strong>${application.type}</strong></div>
      <div>Rekomendacja: <strong>${application.recommender}</strong></div>
      <div>Zwolnienie z oświadczenia: <strong>${application.exempt ? "tak" : "nie"}</strong></div>
      <div>Oświadczenie o niekaralności: <strong>${application.criminalDeclaration ? "zaakceptowane" : application.exempt ? "zwolnienie" : "brak"}</strong></div>
      <div>Złożono: <strong>${formatDate(application.submittedAt)}</strong></div>
      ${application.reviewedAt ? `<div>Rozpatrzono: <strong>${formatDate(application.reviewedAt)}</strong></div>` : ""}
      ${application.reviewNote ? `<div>Uwagi: <strong>${application.reviewNote}</strong></div>` : ""}
    </div>
    <div class="admin-files">
      <a href="${fileUrl(application.code, "declaration")}" target="_blank" rel="noopener">Deklaracja członkowska</a>
      <a href="${fileUrl(application.code, "payment-proof")}" target="_blank" rel="noopener">Dowód wpłaty</a>
    </div>
    <textarea class="admin-review-note" placeholder="Uwagi dla wniosku (opcjonalnie)" aria-label="Uwagi">${application.reviewNote || ""}</textarea>
    <div class="admin-actions">
      <button type="button" class="button primary" data-action="approved">Zatwierdź deklarację</button>
      <button type="button" class="button dark" data-action="rejected">Odrzuć wniosek</button>
      ${application.status !== "pending" ? `<button type="button" class="button secondary" data-action="pending">Przywróć do oczekujących</button>` : ""}
    </div>
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
  showLogin();
});

if (getToken()) {
  showPanel();
  loadApplications();
} else {
  showLogin();
}
