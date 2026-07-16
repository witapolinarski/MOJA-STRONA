const TOKEN_KEY = "sagittariusMemberToken";

const loginSection = document.querySelector("#member-login");
const panelSection = document.querySelector("#member-panel");
const loginForm = document.querySelector("#login-form");
const loginNote = document.querySelector("#login-note");
const logoutButton = document.querySelector("#logout-button");
const printButton = document.querySelector("#print-button");
const refreshButton = document.querySelector("#refresh-button");
const memberName = document.querySelector("#member-name");
const memberRole = document.querySelector("#member-role");
const memberPanelLead = document.querySelector("#member-panel-lead");
const memberTabs = document.querySelector("#member-tabs");
const approvalsBadge = document.querySelector("#approvals-badge");
const tabPanelCertificate = document.querySelector("#tab-panel-certificate");
const tabPanelApprovals = document.querySelector("#tab-panel-approvals");
const approvalsList = document.querySelector("#approvals-list");
const approvalsSummary = document.querySelector("#approvals-summary");

const certLedger = document.querySelector("#cert-ledger");
const certPlace = document.querySelector("#cert-place");
const certDate = document.querySelector("#cert-date");
const certBody = document.querySelector("#cert-body");

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

let currentMember = null;
let applicationsCache = [];

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
  currentMember = null;
  applicationsCache = [];
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
  `/.netlify/functions/member-file?code=${encodeURIComponent(code)}&field=${encodeURIComponent(field)}`;

const canApprove = (application) => Boolean(application.files?.paymentProof);

const switchTab = (tab) => {
  document.querySelectorAll(".strefa-tabs__btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  tabPanelCertificate?.classList.toggle("hidden", tab !== "certificate");
  tabPanelApprovals?.classList.toggle("hidden", tab !== "approvals");
  if (tab === "approvals") loadApplications();
};

const renderCertificate = (payload) => {
  if (memberName) memberName.textContent = payload.member.name;
  if (certLedger) certLedger.textContent = payload.certificate.ledgerRef;
  if (certPlace) certPlace.textContent = payload.certificate.issuePlace;
  if (certDate) certDate.textContent = payload.certificate.issueDate;
  if (certBody) certBody.textContent = payload.certificate.body;
};

const setupApproverUI = (member) => {
  if (member?.isApprover) {
    memberTabs?.classList.remove("hidden");
    if (memberRole) {
      memberRole.textContent = member.role || "Prezes zarządu — akceptacja wniosków";
      memberRole.classList.remove("hidden");
    }
    if (memberPanelLead) {
      memberPanelLead.textContent =
        "Masz dostęp do zaświadczenia oraz panelu akceptacji wniosków nowych członków.";
    }
    loadApplications();
  } else {
    memberTabs?.classList.add("hidden");
    memberRole?.classList.add("hidden");
    if (memberPanelLead) {
      memberPanelLead.textContent =
        "Poniżej znajdziesz zaświadczenie o członkostwie zgodne z danymi z deklaracji. Data na dokumencie odpowiada dniowi wydruku.";
    }
    switchTab("certificate");
  }
};

const renderPaymentSection = (application) => {
  const hasProof = Boolean(application.files?.paymentProof);

  if (hasProof) {
    return `
      <section class="approval-section approval-section-payment">
        <h4>Potwierdzenie wpłaty (przelew)</h4>
        <div class="approval-meta">
          <div>Status: <strong>Dowód przelewu załączony</strong></div>
          <div>Kwota: <strong>${formatMoney(application.fees?.total || application.payment?.amount)}</strong></div>
        </div>
        <div class="approval-files">
          <a href="${fileUrl(application.code, "payment-proof")}" target="_blank" rel="noopener">Pobierz dowód wpłaty</a>
        </div>
      </section>
    `;
  }

  return `
    <section class="approval-section approval-section-payment approval-section-warning">
      <h4>Potwierdzenie wpłaty</h4>
      <p class="approval-alert">Brak dowodu przelewu.</p>
    </section>
  `;
};

const renderApplicationCard = (application) => {
  const ready = canApprove(application);
  const fees = application.fees || {};
  const card = document.createElement("article");
  card.className = "approval-card";

  card.innerHTML = `
    <div class="approval-card-header">
      <div>
        <h3>${application.name}</h3>
        <p class="approval-meta"><strong>${application.code}</strong> · ${application.email}</p>
      </div>
      <span class="approval-status approval-status--${ready ? "ready" : "wait"}">
        ${ready ? "Gotowy do akceptacji" : "Oczekuje na dokumenty/wpłatę"}
      </span>
    </div>

    <section class="approval-section">
      <h4>Wynik formularza</h4>
      <dl class="approval-form-result">
        <div><dt>Telefon</dt><dd>${application.phone || "—"}</dd></div>
        <div><dt>Adres</dt><dd>${application.address || "—"}</dd></div>
        <div><dt>PESEL</dt><dd>${application.pesel || "—"}</dd></div>
        <div><dt>Forma</dt><dd>${honorificLabels[application.honorific] || application.honorific || "—"}</dd></div>
        <div><dt>Typ członkostwa</dt><dd>${typeLabels[application.type] || application.type || "—"}</dd></div>
        <div><dt>Data wniosku</dt><dd>${formatDate(application.submittedAt)}</dd></div>
        <div><dt>Kwota wg kalkulatora</dt><dd>${formatMoney(fees.total || application.payment?.amount)}</dd></div>
        <div><dt>Oświadczenie o niekaralności</dt><dd>${application.criminalDeclaration ? "Zaakceptowane" : "Brak"}</dd></div>
      </dl>
    </section>

    ${renderPaymentSection(application)}

    ${!ready ? `<p class="approval-alert">Wymagany dowód wpłaty przed zatwierdzeniem.</p>` : ""}

    <textarea class="approval-review-note" placeholder="Uwagi (opcjonalnie)" aria-label="Uwagi">${application.reviewNote || ""}</textarea>
    <div class="approval-actions">
      <button type="button" class="button primary" data-action="approved" ${!ready ? "disabled title='Wymagany dowód wpłaty'" : ""}>Zatwierdź członkostwo</button>
      <button type="button" class="button dark" data-action="rejected">Odrzuć wniosek</button>
    </div>
  `;

  card.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const status = button.getAttribute("data-action");
      const reviewNote = card.querySelector(".approval-review-note")?.value || "";

      if (status === "approved" && !confirm(`Zatwierdzić członkostwo wniosku ${application.code}?`)) {
        return;
      }
      if (status === "rejected" && !confirm(`Odrzucić wniosek ${application.code}?`)) {
        return;
      }

      button.disabled = true;
      try {
        await apiFetch("/.netlify/functions/member-applications", {
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

const renderApplications = (applications) => {
  applicationsCache = applications;
  if (!approvalsList) return;

  approvalsList.replaceChildren();
  const pending = applications.filter((item) => item.status === "pending");

  if (currentMember?.isApprover && approvalsBadge) {
    approvalsBadge.textContent = String(pending.length);
    approvalsBadge.classList.toggle("hidden", pending.length === 0);
  }

  if (approvalsSummary) {
    approvalsSummary.textContent =
      pending.length === 0
        ? "Brak wniosków oczekujących na akceptację."
        : `Wniosków do rozpatrzenia: ${pending.length}`;
  }

  if (pending.length === 0) {
    const empty = document.createElement("p");
    empty.className = "approvals-empty";
    empty.textContent = "Gdy kandydat wyśle formularz z dokumentami i opłaci wpisowe, pojawi się tutaj.";
    approvalsList.append(empty);
    return;
  }

  pending.forEach((application) => {
    approvalsList.append(renderApplicationCard(application));
  });
};

const loadApplications = async () => {
  if (!currentMember?.isApprover || isLocalPreview) return;

  if (approvalsSummary) approvalsSummary.textContent = "Ładowanie wniosków…";

  try {
    const data = await apiFetch("/.netlify/functions/member-applications?status=pending");
    renderApplications(data.applications || []);
  } catch (error) {
    if (approvalsSummary) approvalsSummary.textContent = error.message;
    approvalsList?.replaceChildren();
  }
};

const loadProfile = async () => {
  if (isLocalPreview) {
    showPanel();
    currentMember = { name: "Jan Kowalski", isApprover: true, role: "Prezes zarządu — akceptacja wniosków" };
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
    setupApproverUI(currentMember);
    return;
  }

  const data = await apiFetch("/.netlify/functions/member-profile");
  currentMember = data.member;
  renderCertificate(data);
  setupApproverUI(data.member);
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
    currentMember = {
      name: data.name,
      isApprover: data.isApprover,
      role: data.role,
    };
    if (loginNote) loginNote.textContent = "";
    await loadProfile();
  } catch (error) {
    if (loginNote) loginNote.textContent = error.message;
  }
});

document.querySelectorAll(".strefa-tabs__btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
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
