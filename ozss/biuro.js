const STATUS_LABELS = {
  zgloszone: "Zgłoszone — czeka na związek",
  do_poprawy: "Do poprawy — czeka na klub",
  zaakceptowane: "Zaakceptowane",
  odwolane: "Odwołane",
  zrealizowane: "Zrealizowane",
};

const loginSection = document.getElementById("login-section");
const panelSection = document.getElementById("panel-section");
const loginForm = document.getElementById("login-form");
const loginNote = document.getElementById("login-note");
const logoutButton = document.getElementById("logout-button");

let judgesCache = [];

const getToken = () => localStorage.getItem("ozss-biuro-token") || "";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Błąd żądania.");
  return data;
};

const showPanel = () => {
  loginSection.classList.add("hidden");
  panelSection.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
};

const showLogin = () => {
  loginSection.classList.remove("hidden");
  panelSection.classList.add("hidden");
  logoutButton.classList.add("hidden");
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginNote.textContent = "Logowanie…";

  try {
    const password = document.getElementById("login-password").value;
    const response = await fetch("/.netlify/functions/biuro-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Błąd logowania.");

    localStorage.setItem("ozss-biuro-token", data.token);
    loginNote.textContent = "";
    showPanel();
    initPanel();
  } catch (error) {
    loginNote.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("ozss-biuro-token");
  showLogin();
});

// --- Tabs -------------------------------------------------------------

document.querySelectorAll("#tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((btn) => btn.classList.remove("is-active"));
    button.classList.add("is-active");
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
    document.getElementById(`tab-${button.dataset.tab}`).classList.remove("hidden");
  });
});

// --- Zgłoszenia zawodów -------------------------------------------------

const judgeOptions = (selectedId) =>
  `<option value="">—</option>` +
  judgesCache
    .filter((judge) => judge.aktywny !== false)
    .map(
      (judge) =>
        `<option value="${judge.id}" ${judge.id === selectedId ? "selected" : ""}>${escapeHtml(
          `${judge.imie} ${judge.nazwisko}`,
        )}</option>`,
    )
    .join("");

const renderObsadaForm = (competition) => `
  <form class="inline-form obsada-form" data-id="${competition.id}">
    <label class="field">
      Sędzia główny
      <select name="sedziaGlowny">${judgeOptions(competition.obsada?.sedziaGlowny?.id)}</select>
    </label>
    <label class="field">
      Delegat techniczny
      <select name="delegatTechniczny">${judgeOptions(competition.obsada?.delegatTechniczny?.id)}</select>
    </label>
    <label class="field">
      Obserwator
      <select name="obserwator">${judgeOptions(competition.obsada?.obserwator?.id)}</select>
    </label>
    <button class="button outline" type="submit">Zapisz obsadę</button>
  </form>
  <p class="form-note obsada-note"></p>
`;

const renderStatusActions = (competition) => {
  const buttons = [];

  if (competition.status === "zgloszone") {
    buttons.push(`<button class="button gold" data-action="zaakceptowane" data-id="${competition.id}">Zatwierdź</button>`);
    buttons.push(`<button class="button outline" data-action="do_poprawy" data-id="${competition.id}">Odeślij z uwagą</button>`);
    buttons.push(`<button class="button danger" data-action="odwolane" data-id="${competition.id}">Odwołaj</button>`);
  } else if (competition.status === "zaakceptowane") {
    buttons.push(`<button class="button danger" data-action="odwolane" data-id="${competition.id}">Odwołaj</button>`);
  }

  return buttons.length ? `<div class="actions-row">${buttons.join("")}</div>` : "";
};

const renderResultsForm = (competition) => {
  if (competition.status !== "zaakceptowane") return "";
  return `
    <form class="inline-form results-form" data-id="${competition.id}">
      <label class="field">
        Link do wyników
        <input type="url" name="link" placeholder="https://…" required />
      </label>
      <button class="button primary" type="submit">Dodaj wyniki</button>
    </form>
    <p class="form-note results-note"></p>
  `;
};

const renderRegulationLink = (competition) => {
  if (!competition.regulamin?.length) return `<p class="competition-meta">Brak przesłanego regulaminu.</p>`;
  const latest = competition.regulamin[competition.regulamin.length - 1];
  return `<p class="competition-meta"><a href="/.netlify/functions/zawody-plik?key=${encodeURIComponent(latest.key)}&t=${getToken()}" target="_blank" rel="noopener">Regulamin (wersja ${latest.version}) ↗</a></p>`;
};

// Obsadę wymaganą przez regulamin PZSS wpisuje klub (patrz klub.js) — biuro
// widzi ją tylko do odczytu, obok obsady sędziowskiej, którą przypisuje samo.
const renderObsadaPzss = (competition) => {
  const list = competition.obsadaPzss || [];
  if (!list.length) return "";
  return `
    <div class="obsada-pzss-section">
      <strong>Obsada wymagana przez regulamin PZSS (wpisana przez klub):</strong>
      <ul class="obsada-pzss-list">${list
        .map((entry) => `<li>${escapeHtml(entry.funkcja)}: ${escapeHtml(entry.osoba)}</li>`)
        .join("")}</ul>
    </div>
  `;
};

const renderNotes = (uwagi = []) => {
  if (!uwagi.length) return "";
  return `<div class="notes-list">${uwagi
    .map(
      (note) =>
        `<p class="note"><strong>${note.autor === "biuro" ? "Związek" : "Klub"}:</strong> ${escapeHtml(note.tekst)}</p>`,
    )
    .join("")}</div>`;
};

const renderCompetitionCard = (competition) => `
  <article class="competition-card">
    <div class="competition-card-head">
      <div>
        <h3>${escapeHtml(competition.nazwa)}</h3>
        <p class="competition-meta">${escapeHtml(competition.klubNazwa)} · ${escapeHtml((competition.dyscypliny || []).join(", "))} · ${escapeHtml(competition.miejsce)}</p>
        <p class="competition-meta">${competition.terminOd} – ${competition.terminDo}</p>
      </div>
      <span class="badge ${competition.status}">${STATUS_LABELS[competition.status] || competition.status}</span>
    </div>
    ${renderRegulationLink(competition)}
    ${renderNotes(competition.uwagi)}
    ${renderObsadaPzss(competition)}
    ${renderStatusActions(competition)}
    ${renderObsadaForm(competition)}
    ${renderResultsForm(competition)}
  </article>
`;

let competitionsCache = [];

const renderZgloszenia = () => {
  const status = document.getElementById("zgloszenia-filter").value;
  const filtered = status ? competitionsCache.filter((item) => item.status === status) : competitionsCache;

  const container = document.getElementById("zgloszenia-list");
  if (!filtered.length) {
    container.innerHTML = `<p class="empty-state">Brak zgłoszeń dla wybranego filtra.</p>`;
    return;
  }

  container.innerHTML = `<div class="competition-list">${filtered
    .sort((a, b) => new Date(b.terminOd) - new Date(a.terminOd))
    .map(renderCompetitionCard)
    .join("")}</div>`;

  attachCompetitionHandlers();
};

const attachCompetitionHandlers = () => {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const id = button.dataset.id;

      let tekst = "";
      if (action === "do_poprawy") {
        tekst = window.prompt("Uwaga dla klubu — co należy poprawić w regulaminie?") || "";
        if (!tekst.trim()) return;
      } else if (action === "odwolane") {
        if (!window.confirm("Odwołać te zawody?")) return;
        tekst = window.prompt("Powód odwołania (opcjonalnie)") || "";
      }

      try {
        await apiFetch("/.netlify/functions/zawody-status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: action, tekst }),
        });
        await loadZgloszenia();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  document.querySelectorAll(".obsada-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = form.nextElementSibling;
      note.textContent = "Zapisywanie…";
      try {
        const formData = new FormData(form);
        await apiFetch("/.netlify/functions/zawody-obsada", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: form.dataset.id,
            sedziaGlowny: formData.get("sedziaGlowny") || null,
            delegatTechniczny: formData.get("delegatTechniczny") || null,
            obserwator: formData.get("obserwator") || null,
          }),
        });
        note.textContent = "Zapisano obsadę.";
        note.classList.add("ok");
        await loadZgloszenia();
      } catch (error) {
        note.textContent = error.message;
      }
    });
  });

  document.querySelectorAll(".results-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = form.nextElementSibling;
      note.textContent = "Zapisywanie…";
      try {
        const link = form.querySelector("[name=link]").value;
        await apiFetch("/.netlify/functions/zawody-wyniki", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: form.dataset.id, link }),
        });
        note.textContent = "Dodano wyniki.";
        note.classList.add("ok");
        await loadZgloszenia();
      } catch (error) {
        note.textContent = error.message;
      }
    });
  });
};

const loadZgloszenia = async () => {
  const [competitionsData, judgesData] = await Promise.all([
    apiFetch("/.netlify/functions/zawody"),
    apiFetch("/.netlify/functions/sedziowie"),
  ]);
  judgesCache = judgesData.judges || [];
  competitionsCache = (competitionsData.groups || []).flatMap((group) => group.competitions);
  renderZgloszenia();
};

document.getElementById("zgloszenia-filter").addEventListener("change", renderZgloszenia);

// --- Sędziowie ----------------------------------------------------------

const renderJudgesTable = () => {
  const container = document.getElementById("judges-table");
  if (!judgesCache.length) {
    container.innerHTML = `<p class="empty-state">Brak sędziów w rejestrze.</p>`;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Imię i nazwisko</th><th>Klasa</th><th>Kontakt</th><th>Ważność licencji</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${judgesCache
          .map(
            (judge) => `
          <tr>
            <td>${escapeHtml(judge.imie)} ${escapeHtml(judge.nazwisko)}</td>
            <td>${escapeHtml(judge.klasa || "—")}</td>
            <td>${escapeHtml(judge.email || judge.telefon || "—")}</td>
            <td>${escapeHtml(judge.licencjaDo || "—")}</td>
            <td>${judge.aktywny === false ? "Nieaktywny" : "Aktywny"}</td>
            <td><button class="button outline toggle-judge" data-id="${judge.id}" data-active="${judge.aktywny !== false}">
              ${judge.aktywny === false ? "Aktywuj" : "Dezaktywuj"}
            </button></td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".toggle-judge").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiFetch("/.netlify/functions/sedziowie", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: button.dataset.id, aktywny: button.dataset.active !== "true" }),
        });
        await loadJudges();
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
};

const loadJudges = async () => {
  const data = await apiFetch("/.netlify/functions/sedziowie");
  judgesCache = data.judges || [];
  renderJudgesTable();
};

document.getElementById("judge-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const note = document.getElementById("judge-note");
  note.textContent = "Zapisywanie…";
  try {
    const formData = new FormData(event.target);
    await apiFetch("/.netlify/functions/sedziowie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    note.textContent = "Dodano sędziego.";
    note.classList.add("ok");
    event.target.reset();
    await loadJudges();
  } catch (error) {
    note.textContent = error.message;
  }
});

// --- Kluby zrzeszone ------------------------------------------------------

let clubsCache = [];

const renderClubsTable = () => {
  const container = document.getElementById("clubs-table");
  if (!clubsCache.length) {
    container.innerHTML = `<p class="empty-state">Brak klubów w rejestrze.</p>`;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Kod klubu</th><th>Nazwa</th><th>Miejscowość</th><th>Kontakt</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${clubsCache
          .map(
            (club) => `
          <tr>
            <td>${escapeHtml(club.id)}</td>
            <td>${escapeHtml(club.nazwa)}</td>
            <td>${escapeHtml(club.miejscowosc || "—")}</td>
            <td>${escapeHtml(club.kontaktEmail || club.kontaktTelefon || "—")}</td>
            <td>${club.aktywny === false ? "Nieaktywny" : "Aktywny"}</td>
            <td><button class="button outline reset-password" data-id="${club.id}">Zresetuj hasło</button></td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".reset-password").forEach((button) => {
    button.addEventListener("click", async () => {
      const password = window.prompt("Nowe hasło dla klubu (min. 6 znaków):");
      if (!password) return;
      try {
        await apiFetch("/.netlify/functions/biuro-kluby", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: button.dataset.id, password }),
        });
        window.alert("Hasło zostało zmienione.");
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
};

const loadClubs = async () => {
  const data = await apiFetch("/.netlify/functions/biuro-kluby");
  clubsCache = data.clubs || [];
  renderClubsTable();
};

document.getElementById("club-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const note = document.getElementById("club-note");
  note.textContent = "Zapisywanie…";
  try {
    const formData = new FormData(event.target);
    const data = await apiFetch("/.netlify/functions/biuro-kluby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    note.textContent = `Utworzono klub, kod logowania: ${data.club.id}`;
    note.classList.add("ok");
    event.target.reset();
    await loadClubs();
  } catch (error) {
    note.textContent = error.message;
  }
});

// --- Init -----------------------------------------------------------------

const initPanel = async () => {
  try {
    await loadZgloszenia();
    renderJudgesTable();
    await loadClubs();
  } catch (error) {
    console.error(error);
  }
};

if (getToken()) {
  showPanel();
  initPanel();
} else {
  showLogin();
}
