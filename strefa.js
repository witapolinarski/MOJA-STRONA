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
const tabPanelRoster = document.querySelector("#tab-panel-roster");
const tabPanelDues = document.querySelector("#tab-panel-dues");
const approvalsList = document.querySelector("#approvals-list");
const approvalsSummary = document.querySelector("#approvals-summary");
const rosterSummary = document.querySelector("#roster-summary");
const referralLeaderboard = document.querySelector("#referral-leaderboard");
const rosterTableWrap = document.querySelector("#roster-table-wrap");
const rosterSearch = document.querySelector("#roster-search");
const rosterImportText = document.querySelector("#roster-import-text");
const rosterImportButton = document.querySelector("#roster-import-button");
const rosterRefreshButton = document.querySelector("#roster-refresh-button");
const rosterImportNote = document.querySelector("#roster-import-note");
const licenseRenewalYear = document.querySelector("#license-renewal-year");
const licenseSummaryGrid = document.querySelector("#license-summary-grid");
const licenseSummaryYears = document.querySelector("#license-summary-years");
const duesSummary = document.querySelector("#dues-summary");
const duesFileInfo = document.querySelector("#dues-file-info");
const duesFileInput = document.querySelector("#dues-file-input");
const duesPickButton = document.querySelector("#dues-pick-button");
const duesDownloadButton = document.querySelector("#dues-download-button");
const duesRefreshButton = document.querySelector("#dues-refresh-button");
const duesTableWrap = document.querySelector("#dues-table-wrap");
const duesExemptWrap = document.querySelector("#dues-exempt-wrap");
const duesSearch = document.querySelector("#dues-search");
const duesNote = document.querySelector("#dues-note");
const licenseFileInfo = document.querySelector("#license-file-info");
const licenseFileInput = document.querySelector("#license-file-input");
const licensePickButton = document.querySelector("#license-pick-button");
const approverDropPanel = document.querySelector("#approver-drop-panel");
const strefaDropTarget = document.querySelector("#strefa-drop-target");
const strefaDropPickButton = document.querySelector("#strefa-drop-pick-button");
const strefaDropStatus = document.querySelector("#strefa-drop-status");
const licenseDownloadButton = document.querySelector("#license-download-button");
const licenseFileNote = document.querySelector("#license-file-note");

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
let rosterCache = null;
let duesMembers = [];
let duesExemptMembers = [];
let duesMeta = null;

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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const switchTab = (tab) => {
  document.querySelectorAll(".strefa-tabs__btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  tabPanelCertificate?.classList.toggle("hidden", tab !== "certificate");
  tabPanelApprovals?.classList.toggle("hidden", tab !== "approvals");
  tabPanelRoster?.classList.toggle("hidden", tab !== "roster");
  tabPanelDues?.classList.toggle("hidden", tab !== "dues");
  if (tab === "approvals") loadApplications();
  if (tab === "roster") loadRoster();
  if (tab === "dues") loadDues();
};

const renderLicenseFileInfo = (file) => {
  if (!licenseFileInfo) return;

  if (!file?.fileName) {
    licenseFileInfo.textContent = "Brak wgranego rejestru licencji.";
    licenseDownloadButton?.classList.add("hidden");
    return;
  }

  const uploadedAt = file.uploadedAt ? formatDate(file.uploadedAt) : "—";
  const sizeKb = file.size ? `${Math.round(file.size / 1024)} KB` : "";
  licenseFileInfo.textContent = `Aktualny plik: ${file.fileName} · ${sizeKb} · wgrany ${uploadedAt}`;
  licenseDownloadButton?.classList.remove("hidden");
};

const loadLicenseFileMeta = async () => {
  if (!currentMember?.isApprover || isLocalPreview) return;

  try {
    const data = await apiFetch("/.netlify/functions/member-license-file");
    renderLicenseFileInfo(data.file);
  } catch {
    renderLicenseFileInfo(null);
  }
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
    approverDropPanel?.classList.remove("hidden");
    if (memberRole) {
      memberRole.textContent = member.role || "Prezes zarządu — akceptacja wniosków";
      memberRole.classList.remove("hidden");
    }
    if (memberPanelLead) {
      memberPanelLead.textContent =
        "Masz dostęp do zaświadczenia, akceptacji wniosków, bazy PZSS, rozliczeń składek i punktów rekomendacji.";
    }
    loadApplications();
  } else {
    memberTabs?.classList.add("hidden");
    approverDropPanel?.classList.add("hidden");
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
        <div><dt>Rekomendacja</dt><dd>${escapeHtml(application.recommender || "—")}${application.recommenderMatchedName ? ` <span class="approval-match">(${escapeHtml(application.recommenderMatchedName)})</span>` : ""}</dd></div>
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

const normalizeSearch = (value) => String(value || "").trim().toLowerCase();

const renderLeaderboard = (leaderboard = []) => {
  if (!referralLeaderboard) return;

  if (!leaderboard.length) {
    referralLeaderboard.innerHTML = `<p class="roster-empty">Brak przyznanych punktów rekomendacji.</p>`;
    return;
  }

  referralLeaderboard.innerHTML = `
    <table class="roster-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Członek</th>
          <th>Punkty</th>
          <th>Rekomendacje</th>
          <th>Ostatnia</th>
        </tr>
      </thead>
      <tbody>
        ${leaderboard
          .map(
            (entry, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(entry.name)}</td>
            <td><strong>${entry.points}</strong></td>
            <td>${entry.referrals}</td>
            <td>${entry.lastReferralAt ? formatDate(entry.lastReferralAt) : "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const formatLicenseStatus = (member) => {
  if (member.licenseActive === true) {
    const year = member.licenseValidYear ? ` (${member.licenseValidYear})` : "";
    return `Aktualna${year}`;
  }
  if (member.licenseActive === false) {
    const year = member.licenseLastValidYear ? ` — ostatnio ${member.licenseLastValidYear}` : "";
    return `Nieaktualna${year}`;
  }
  return "—";
};

const renderRosterTable = (members = []) => {
  if (!rosterTableWrap) return;

  const query = normalizeSearch(rosterSearch?.value || "");
  const filtered = members.filter((member) => {
    if (!query) return true;
    const haystack = [member.displayName, member.fullName, member.lastName, member.firstName, member.email, member.pesel]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  if (!filtered.length) {
    rosterTableWrap.innerHTML = `<p class="roster-empty">Brak wyników w bazie.</p>`;
    return;
  }

  rosterTableWrap.innerHTML = `
    <table class="roster-table">
      <thead>
        <tr>
          <th>Nazwisko i imię</th>
          <th>PESEL</th>
          <th>E-mail</th>
          <th>Od</th>
          <th>Klub</th>
          <th>Licencja</th>
        </tr>
      </thead>
      <tbody>
        ${filtered
          .slice(0, 200)
          .map(
            (member) => `
          <tr>
            <td>${escapeHtml(member.displayName || member.fullName)}</td>
            <td>${escapeHtml(member.pesel || "—")}</td>
            <td>${escapeHtml(member.email || "—")}</td>
            <td>${escapeHtml(member.memberSince || "—")}</td>
            <td>${member.active === false ? "Wykreślony" : "Aktywny"}</td>
            <td>${escapeHtml(formatLicenseStatus(member))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    ${filtered.length > 200 ? `<p class="roster-hint">Pokazano pierwsze 200 z ${filtered.length} wyników. Zawęź wyszukiwanie.</p>` : ""}
  `;
};

const renderLicenseSummary = (summary) => {
  if (!licenseSummaryGrid) return;

  if (!summary?.totalPlayers) {
    licenseSummaryGrid.innerHTML = `<p class="roster-empty">Brak danych do zestawienia licencji.</p>`;
    if (licenseSummaryYears) licenseSummaryYears.replaceChildren();
    if (licenseRenewalYear) licenseRenewalYear.textContent = "";
    return;
  }

  if (licenseRenewalYear) licenseRenewalYear.textContent = String(summary.renewalYear);

  const cards = [
    ["Zawodnicy w bazie", summary.totalPlayers],
    ["Aktywni (bez blokady)", summary.activePlayers],
    ["Licencje aktualne", summary.activeLicenses ?? "—"],
    ["Licencje nieaktualne", summary.inactiveLicenses ?? "—"],
    ["Do wznowienia licencji", summary.renewals],
    ["Nowe licencje (przyjęci w roku)", summary.newLicenses],
    ["Zablokowani", summary.blockedPlayers],
    ["Szac. opłata klubu", formatMoney(summary.estimatedClubCostPln)],
  ];

  licenseSummaryGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="license-summary-card">
          <p class="license-summary-label">${label}</p>
          <p class="license-summary-value">${value}</p>
        </article>
      `,
    )
    .join("");

  if (!licenseSummaryYears) return;

  const years = Object.entries(summary.joinedByYear || {}).sort(([a], [b]) => Number(b) - Number(a));
  if (!years.length) {
    licenseSummaryYears.replaceChildren();
    return;
  }

  licenseSummaryYears.innerHTML = `
    <h4>Przyjęcia do klubu wg roku</h4>
    <table class="roster-table license-years-table">
      <thead>
        <tr>
          <th>Rok</th>
          <th>Liczba zawodników</th>
        </tr>
      </thead>
      <tbody>
        ${years
          .map(
            ([year, count]) => `
              <tr>
                <td>${year}</td>
                <td>${count}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
    <p class="roster-hint">Opłata licencyjna PZSS: ${formatMoney(summary.licenseFeePln)} za zawodnika · szacunek łączny dla ${summary.activePlayers} aktywnych.</p>
  `;
};

const duesStatusLabels = {
  paid: "Rozliczony",
  arrears: "Zaległość",
  no_payment: "Brak wpłaty",
  unknown: "Brak daty przyjęcia",
  overpaid: "Nadpłata",
};

const renderDuesFileInfo = (file) => {
  if (!duesFileInfo) return;

  if (!file?.fileName) {
    duesFileInfo.textContent = "Brak wgranego pliku bankowego.";
    duesDownloadButton?.classList.add("hidden");
    return;
  }

  const uploadedAt = file.uploadedAt ? formatDate(file.uploadedAt) : "—";
  const sizeKb = file.size ? `${Math.round(file.size / 1024)} KB` : "";
  duesFileInfo.textContent = `Plik bankowy: ${file.fileName} · ${sizeKb} · wgrany ${uploadedAt}`;
  duesDownloadButton?.classList.remove("hidden");
};

const renderDuesExemptTable = () => {
  if (!duesExemptWrap) return;

  if (!duesExemptMembers.length) {
    duesExemptWrap.innerHTML = `<p class="roster-empty">Brak osób na liście zwolnionych ze składek.</p>`;
    return;
  }

  duesExemptWrap.innerHTML = `
    <table class="roster-table dues-exempt-table">
      <thead>
        <tr>
          <th>Zawodnik</th>
          <th>Przyjęty</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${duesExemptMembers
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.displayName || "—")}</td>
            <td>${escapeHtml(row.memberSince || "—")}</td>
            <td>${row.missingFromRoster ? "Brak w bazie PZSS" : "Zwolniony ze składek"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const renderDuesTable = () => {
  if (!duesTableWrap) return;

  const query = duesSearch?.value.trim().toLowerCase() || "";
  const rows = duesMembers.filter((row) => {
    if (!query) return true;
    return [row.displayName, row.pesel, row.memberSince]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  if (!duesMembers.length) {
    duesTableWrap.innerHTML = `<p class="roster-empty">Brak aktywnych zawodników w bazie PZSS. Zaimportuj bazę w zakładce „Baza PZSS”.</p>`;
    return;
  }

  if (!rows.length) {
    duesTableWrap.innerHTML = `<p class="roster-empty">Brak wyników wyszukiwania.</p>`;
    return;
  }

  duesTableWrap.innerHTML = `
    <table class="roster-table">
      <thead>
        <tr>
          <th>Zawodnik</th>
          <th>Przyjęty</th>
          <th>Wpisowe</th>
          <th>Składki</th>
          <th>Licencja</th>
          <th>Razem</th>
          <th>Wpłacono</th>
          <th>Saldo</th>
          <th>Powód zaległości</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.displayName || "—")}</td>
            <td>${escapeHtml(row.memberSince || "—")}</td>
            <td>${row.expected?.unknown ? "—" : formatMoney(row.expected?.entryFee || 0)}</td>
            <td>${row.expected?.unknown ? "—" : formatMoney(row.expected?.monthlyTotal || 0)}</td>
            <td>${row.expected?.unknown ? "—" : formatMoney(row.expected?.licenseTotal || 0)}</td>
            <td>${row.expected?.unknown ? "—" : formatMoney(row.expected?.total || 0)}</td>
            <td>${formatMoney(row.paidAmount || 0)}</td>
            <td><strong>${row.expected?.unknown ? "—" : formatMoney(row.balance || 0)}</strong></td>
            <td>${row.balance > 0.5 ? escapeHtml(row.arrearsReason || "—") : "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <p class="roster-hint">Pokazano ${rows.length} z ${duesMembers.length} zawodników · stan na ${escapeHtml(duesMeta?.asOf || "—")}. Kolejność rozliczenia wpłat: wpisowe → licencja → składki.</p>
  `;
};

const applyDuesData = (data) => {
  const reconciliation = data?.reconciliation;
  duesMembers = reconciliation?.members || [];
  duesExemptMembers = reconciliation?.exemptFromDues || [];
  duesMeta = reconciliation;
  renderDuesFileInfo(data?.file);
  renderDuesExemptTable();
  renderDuesTable();

  if (duesSummary) {
    const summary = reconciliation?.summary;
    const paymentsInfo = summary?.rowsInFile
      ? ` · ${summary.rowsInFile} wpłat z banku`
      : " · bez pliku bankowego";
    const exemptInfo = summary?.exemptMembers
      ? ` · zwolnieni ze składek: ${summary.exemptMembers}`
      : "";
    duesSummary.textContent = `${summary?.activeMembers || duesMembers.length} zawodników · zaległości: ${summary?.withArrears || 0} · rozliczeni: ${summary?.paidUp || 0}${exemptInfo}${paymentsInfo}`;
  }
};

const loadDues = async () => {
  if (!currentMember?.isApprover || isLocalPreview) return;

  if (duesSummary) duesSummary.textContent = "Ładowanie zestawienia…";
  if (duesTableWrap) duesTableWrap.innerHTML = `<p class="roster-empty">Ładowanie listy zawodników…</p>`;

  try {
    const data = await apiFetch("/.netlify/functions/member-dues");
    applyDuesData(data);
    if (duesNote) duesNote.textContent = "";
  } catch (error) {
    if (duesSummary) duesSummary.textContent = error.message;
    if (duesTableWrap) {
      duesTableWrap.innerHTML = `<p class="roster-empty">${escapeHtml(error.message)}</p>`;
    }
  }
};

const renderRoster = (data) => {
  rosterCache = data;
  const roster = data?.roster || {};
  const referrals = data?.referrals || {};

  if (rosterSummary) {
    rosterSummary.textContent = `Baza: ${roster.memberCount || 0} członków (${roster.activeCount || 0} aktywnych) · ${referrals.totalPoints || 0} punktów rekomendacji · aktualizacja: ${roster.updatedAt ? formatDate(roster.updatedAt) : "—"}`;
  }

  renderLicenseSummary(data?.licenseSummary);
  renderLeaderboard(referrals.leaderboard || []);
  renderRosterTable(roster.members || []);
};

const loadRoster = async () => {
  if (!currentMember?.isApprover || isLocalPreview) return;

  if (rosterSummary) rosterSummary.textContent = "Ładowanie bazy członków…";

  try {
    const data = await apiFetch("/.netlify/functions/member-roster");
    renderRoster(data);
    if (rosterImportNote) rosterImportNote.textContent = "";
    await loadLicenseFileMeta();
  } catch (error) {
    if (rosterSummary) rosterSummary.textContent = error.message;
    referralLeaderboard?.replaceChildren();
    rosterTableWrap?.replaceChildren();
    licenseSummaryGrid?.replaceChildren();
    if (licenseSummaryYears) licenseSummaryYears.replaceChildren();
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

rosterSearch?.addEventListener("input", () => {
  if (rosterCache) renderRosterTable(rosterCache.roster?.members || []);
});

rosterRefreshButton?.addEventListener("click", () => loadRoster());

rosterImportButton?.addEventListener("click", async () => {
  const text = rosterImportText?.value.trim() || "";
  if (!text) {
    if (rosterImportNote) rosterImportNote.textContent = "Wklej listę członków z PZSS przed importem.";
    return;
  }

  rosterImportButton.disabled = true;
  if (rosterImportNote) rosterImportNote.textContent = "Importowanie…";

  try {
    const result = await apiFetch("/.netlify/functions/member-roster", {
      method: "POST",
      body: JSON.stringify({ text, source: "pzss-paste" }),
    });
    if (rosterImportNote) {
      rosterImportNote.textContent = `Zaimportowano ${result.memberCount} członków.`;
    }
    if (rosterImportText) rosterImportText.value = "";
    await loadRoster();
  } catch (error) {
    if (rosterImportNote) rosterImportNote.textContent = error.message;
  } finally {
    rosterImportButton.disabled = false;
  }
});

duesRefreshButton?.addEventListener("click", () => loadDues());

duesSearch?.addEventListener("input", () => renderDuesTable());

duesDownloadButton?.addEventListener("click", async () => {
  try {
    const token = getToken();
    const response = await fetch("/.netlify/functions/member-dues?download=1", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("Nie udało się pobrać pliku.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rozliczenie-skladek";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (duesNote) duesNote.textContent = error.message;
  }
});

const uploadDuesFile = async (file) => {
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);
  if (duesNote) duesNote.textContent = `Wgrywanie: ${file.name}…`;

  const token = getToken();
  const response = await fetch("/.netlify/functions/member-dues", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Nie udało się wgrać pliku.");

  applyDuesData(data);
  if (duesNote) duesNote.textContent = `Wgrano plik bankowy: ${data.file?.fileName || file.name}.`;
};

const openNativeFilePicker = (onFile) => {
  const input = document.createElement("input");
  input.type = "file";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      input.remove();
      if (file) onFile(file);
    },
    { once: true },
  );
  input.click();
};

const isLikelyLicenseFile = (fileName = "") =>
  /licencj|license|rejestr/i.test(fileName) && !/operacj|zestawienie|składk|skladk|wpłat|wplat/i.test(fileName);

const uploadLicenseFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const token = getToken();
  const response = await fetch("/.netlify/functions/member-license-file", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Nie udało się zaimportować rejestru licencji.");

  renderLicenseFileInfo(data.file);
  if (licenseFileNote) {
    licenseFileNote.textContent = `Zaimportowano ${data.import?.matched || 0} licencji do bazy.`;
  }
  await loadRoster();
  return data;
};

const uploadClubFile = async (file, statusEl = duesNote) => {
  if (isLikelyLicenseFile(file.name)) {
    if (statusEl) statusEl.textContent = `Import rejestru licencji: ${file.name}…`;
    const data = await uploadLicenseFile(file);
    switchTab("roster");
    if (statusEl) {
      statusEl.textContent = `Wgrano rejestr licencji: ${file.name} · dopasowano ${data.import?.matched || 0} osób.`;
    }
    return { type: "license", data };
  }

  if (statusEl) statusEl.textContent = `Wgrywanie zestawienia: ${file.name}…`;
  await uploadDuesFile(file);
  switchTab("dues");
  if (statusEl) statusEl.textContent = `Wgrano zestawienie: ${file.name}.`;
  return { type: "dues" };
};

const bindDropTarget = (element, statusEl) => {
  if (!element) return;

  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("is-dragover");
  });

  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("is-dragover");
  });

  element.addEventListener("drop", async (event) => {
    event.preventDefault();
    element.classList.remove("is-dragover");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    try {
      await uploadClubFile(file, statusEl);
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message;
    }
  });
};

bindDropTarget(strefaDropTarget, strefaDropStatus);

strefaDropPickButton?.addEventListener("click", () => {
  openNativeFilePicker(async (file) => {
    try {
      await uploadClubFile(file, strefaDropStatus);
    } catch (error) {
      if (strefaDropStatus) strefaDropStatus.textContent = error.message;
    }
  });
});

duesPickButton?.addEventListener("click", () => {
  openNativeFilePicker(async (file) => {
    try {
      await uploadDuesFile(file);
    } catch (error) {
      if (duesNote) duesNote.textContent = error.message;
    }
  });
});

duesFileInput?.addEventListener("change", async () => {
  const file = duesFileInput.files?.[0];
  if (!file) return;

  try {
    await uploadDuesFile(file);
  } catch (error) {
    if (duesNote) duesNote.textContent = error.message;
  } finally {
    duesFileInput.value = "";
  }
});

licenseDownloadButton?.addEventListener("click", async () => {
  try {
    const token = getToken();
    const response = await fetch("/.netlify/functions/member-license-file?download=1", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("Nie udało się pobrać pliku.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rejestr-licencji";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (licenseFileNote) licenseFileNote.textContent = error.message;
  }
});

licensePickButton?.addEventListener("click", () => {
  openNativeFilePicker(async (file) => {
    if (licenseFileInput) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      licenseFileInput.files = transfer.files;
      licenseFileInput.dispatchEvent(new Event("change"));
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (licenseFileNote) licenseFileNote.textContent = "Importowanie rejestru licencji…";

    try {
      const token = getToken();
      const response = await fetch("/.netlify/functions/member-license-file", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się zaimportować pliku.");
      renderLicenseFileInfo(data.file);
      if (licenseFileNote) {
        licenseFileNote.textContent = `Zaimportowano ${data.import?.matched || 0} licencji do bazy.`;
      }
      await loadRoster();
    } catch (error) {
      if (licenseFileNote) licenseFileNote.textContent = error.message;
    }
  });
});

licenseFileInput?.addEventListener("change", async () => {
  const file = licenseFileInput.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);
  if (licenseFileNote) licenseFileNote.textContent = "Importowanie rejestru licencji…";

  try {
    const token = getToken();
    const response = await fetch("/.netlify/functions/member-license-file", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Nie udało się zaimportować pliku.");

    renderLicenseFileInfo(data.file);
    if (licenseFileNote) {
      licenseFileNote.textContent = `Zaimportowano ${data.import?.matched || 0} licencji do bazy${
        data.import?.unmatchedCount ? ` · ${data.import.unmatchedCount} bez dopasowania` : ""
      }.`;
    }
    await loadRoster();
  } catch (error) {
    if (licenseFileNote) licenseFileNote.textContent = error.message;
  } finally {
    licenseFileInput.value = "";
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
