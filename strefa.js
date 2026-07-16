const TOKEN_KEY = "sagittariusMemberToken";

const loginSection = document.querySelector("#member-login");
const panelSection = document.querySelector("#member-panel");
const loginForm = document.querySelector("#login-form");
const loginNote = document.querySelector("#login-note");
const logoutButton = document.querySelector("#logout-button");
const printButton = document.querySelector("#print-button");
const refreshButton = document.querySelector("#refresh-button");
const memberName = document.querySelector("#member-name");

const certLedger = document.querySelector("#cert-ledger");
const certPlace = document.querySelector("#cert-place");
const certDate = document.querySelector("#cert-date");
const certBody = document.querySelector("#cert-body");

const isLocalPreview =
  window.location.protocol === "file:" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const getToken = () => sessionStorage.getItem(TOKEN_KEY) || "";

const setToken = (token) => {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
};

const showLogin = () => {
  loginSection?.classList.remove("hidden");
  panelSection?.classList.add("hidden");
  logoutButton?.classList.add("hidden");
};

const showPanel = () => {
  loginSection?.classList.add("hidden");
  panelSection?.classList.remove("hidden");
  logoutButton?.classList.remove("hidden");
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

const renderCertificate = (payload) => {
  if (memberName) memberName.textContent = payload.member.name;
  if (certLedger) certLedger.textContent = payload.certificate.ledgerRef;
  if (certPlace) certPlace.textContent = payload.certificate.issuePlace;
  if (certDate) certDate.textContent = payload.certificate.issueDate;
  if (certBody) certBody.textContent = payload.certificate.body;
};

const loadProfile = async () => {
  if (isLocalPreview) {
    showPanel();
    renderCertificate({
      member: { name: "Jan Kowalski" },
      certificate: {
        ledgerRef: "130/2026",
        issuePlace: "Izbicko",
        issueDate: "16 lipca 2026 r.",
        body:
          'Zaświadcza się, że Pan Jan Kowalski, PESEL 90010112345 - jest członkiem stowarzyszenia „Towarzystwo Miłośników Strzelectwa SAGITTARIUS”. Stowarzyszenie prowadzi działalność statutową w zakresie uprawiania i propagowania strzelectwa sportowego i kolekcjonerstwa broni. Zarejestrowane jest w KRS pod numerem 0000591210. Posiada aktualną licencję klubową Polskiego Związku Strzelectwa Sportowego 2026 r. w zakresie pistolet, karabin, strzelba.',
      },
    });
    return;
  }

  const data = await apiFetch("/.netlify/functions/member-profile");
  renderCertificate(data);
  showPanel();
};

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginNote) loginNote.textContent = "Logowanie…";

  const email = document.querySelector("#member-email")?.value.trim() || "";
  const pesel = document.querySelector("#member-pesel")?.value.replace(/\D/g, "") || "";

  if (isLocalPreview) {
    if (loginNote) {
      loginNote.textContent =
        "Tryb lokalny: podgląd zaświadczenia. Na Netlify logowanie wymaga zatwierdzonego wniosku.";
    }
    await loadProfile();
    return;
  }

  try {
    const data = await fetch("/.netlify/functions/member-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, pesel }),
    }).then((response) => response.json());

    if (!data.token) {
      throw new Error(data.error || "Nie udało się zalogować.");
    }

    setToken(data.token);
    if (loginNote) loginNote.textContent = "";
    await loadProfile();
  } catch (error) {
    if (loginNote) loginNote.textContent = error.message;
  }
});

logoutButton?.addEventListener("click", () => {
  setToken("");
  showLogin();
});

printButton?.addEventListener("click", () => {
  window.print();
});

refreshButton?.addEventListener("click", async () => {
  try {
    await loadProfile();
  } catch (error) {
    alert(error.message);
  }
});

if (getToken()) {
  loadProfile().catch(() => {
    setToken("");
    showLogin();
  });
} else {
  showLogin();
}
