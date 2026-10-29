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
const klubNazwaEl = document.getElementById("klub-nazwa");
const createForm = document.getElementById("create-form");
const createNote = document.getElementById("create-note");
const ownList = document.getElementById("own-list");
const createObsadaPzssRows = document.getElementById("create-obsada-pzss-rows");

const getToken = () => localStorage.getItem("ozss-klub-token") || "";
const getKlub = () => JSON.parse(localStorage.getItem("ozss-klub") || "null");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

// Obsada wymagana przez regulamin PZSS (sędzia główny, sekretarz zawodów,
// kierownik strzelania…) — klub wybiera funkcję z rozwijanej listy (albo
// "Inna funkcja…", co odkrywa pole do wpisania własnej nazwy) i wpisuje
// osobę. Wiersze mają takie samo name="…" w każdym formularzu, a wartość
// funkcji jest "rozwiązywana" (select albo pole "inna") tuż przed wysłaniem
// — patrz readObsadaPzssRows — więc backend (zawody.mjs, zawody-obsada-pzss.mjs)
// zawsze dostaje gotowy tekst funkcji, niezależnie od tego, jak została wybrana.
const PZSS_ROLE_OPTIONS = [
  "Sędzia Główny",
  "Zastępca Sędziego Głównego",
  "Sekretarz Zawodów",
  "Kierownik Strzelania",
  "Lekarz zawodów / ratownik medyczny",
];
const OBSADA_PZSS_INNA = "__inna__";

const obsadaPzssRowHtml = (funkcja = "", osoba = "") => {
  const isKnownRole = PZSS_ROLE_OPTIONS.includes(funkcja);
  const isCustomRole = Boolean(funkcja) && !isKnownRole;
  const optionsHtml = PZSS_ROLE_OPTIONS.map(
    (role) => `<option value="${escapeHtml(role)}" ${role === funkcja ? "selected" : ""}>${escapeHtml(role)}</option>`,
  ).join("");

  return `
    <div class="obsada-pzss-row">
      <div class="obsada-pzss-rola-wrap">
        <select name="obsadaPzssRola" class="obsada-pzss-rola-select">
          <option value="" ${funkcja ? "" : "selected"}>— wybierz funkcję —</option>
          ${optionsHtml}
          <option value="${OBSADA_PZSS_INNA}" ${isCustomRole ? "selected" : ""}>Inna funkcja…</option>
        </select>
        <input
          type="text"
          class="obsada-pzss-rola-inna"
          placeholder="Wpisz nazwę funkcji"
          value="${escapeHtml(isCustomRole ? funkcja : "")}"
          ${isCustomRole ? "" : "hidden"}
        />
      </div>
      <input type="text" name="obsadaPzssOsoba" placeholder="Imię i nazwisko" value="${escapeHtml(osoba)}" />
      <button type="button" class="button outline small remove-obsada-pzss-row" aria-label="Usuń pozycję">✕</button>
    </div>
  `;
};

const addObsadaPzssRow = (container, funkcja = "", osoba = "") => {
  if (!container) return;
  container.insertAdjacentHTML("beforeend", obsadaPzssRowHtml(funkcja, osoba));
};

const resetCreateObsadaPzssRows = () => {
  createObsadaPzssRows.innerHTML = "";
  addObsadaPzssRow(createObsadaPzssRows);
  addObsadaPzssRow(createObsadaPzssRows);
  addObsadaPzssRow(createObsadaPzssRows);
};

// Czyta aktualną wartość "funkcji" z wiersza: wartość rozwijanej listy, albo —
// gdy wybrano "Inna funkcja…" — treść towarzyszącego jej pola tekstowego.
const readObsadaPzssRowFunkcja = (row) => {
  const select = row.querySelector(".obsada-pzss-rola-select");
  if (!select) return "";
  if (select.value === OBSADA_PZSS_INNA) {
    return row.querySelector(".obsada-pzss-rola-inna")?.value || "";
  }
  return select.value;
};

const readObsadaPzssRows = (container) =>
  [...(container?.querySelectorAll(".obsada-pzss-row") || [])].map((row) => ({
    funkcja: readObsadaPzssRowFunkcja(row),
    osoba: row.querySelector('[name="obsadaPzssOsoba"]')?.value || "",
  }));

document.addEventListener("click", (event) => {
  if (event.target.classList.contains("add-obsada-pzss-row")) {
    const rows = event.target.closest(".obsada-fieldset, .obsada-pzss-edit-form")?.querySelector(".obsada-pzss-rows");
    addObsadaPzssRow(rows);
  } else if (event.target.classList.contains("remove-obsada-pzss-row")) {
    event.target.closest(".obsada-pzss-row")?.remove();
  }
});

// Wybranie "Inna funkcja…" odkrywa pole tekstowe do wpisania własnej nazwy;
// powrót do znanej funkcji z listy chowa je i czyści, żeby nie wysłać śmieci.
document.addEventListener("change", (event) => {
  if (!event.target.classList.contains("obsada-pzss-rola-select")) return;
  const wrap = event.target.closest(".obsada-pzss-rola-wrap");
  const innaInput = wrap?.querySelector(".obsada-pzss-rola-inna");
  if (!innaInput) return;
  if (event.target.value === OBSADA_PZSS_INNA) {
    innaInput.hidden = false;
    innaInput.focus();
  } else {
    innaInput.hidden = true;
    innaInput.value = "";
  }
});

resetCreateObsadaPzssRows();

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
  klubNazwaEl.textContent = getKlub()?.nazwa || "klubie";
};

const showLogin = () => {
  loginSection.classList.remove("hidden");
  panelSection.classList.add("hidden");
  logoutButton.classList.add("hidden");
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginNote.textContent = "Logowanie…";
  loginNote.classList.remove("ok");

  try {
    const klubId = document.getElementById("login-klubid").value.trim();
    const password = document.getElementById("login-password").value;

    const response = await fetch("/.netlify/functions/klub-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ klubId, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Błąd logowania.");

    localStorage.setItem("ozss-klub-token", data.token);
    localStorage.setItem("ozss-klub", JSON.stringify(data.klub));
    loginNote.textContent = "";
    showPanel();
    loadOwnCompetitions();
  } catch (error) {
    loginNote.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("ozss-klub-token");
  localStorage.removeItem("ozss-klub");
  showLogin();
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  createNote.textContent = "Wysyłanie zgłoszenia…";
  createNote.classList.remove("ok");

  try {
    const formData = new FormData(createForm);
    if (!formData.getAll("dyscyplina").length) {
      throw new Error("Wybierz co najmniej jedną dyscyplinę.");
    }

    // formData.getAll("obsadaPzssRola") złapałoby surową wartość <select>
    // (np. sentinel "__inna__"), więc funkcję liczymy osobno przez
    // readObsadaPzssRows i nadpisujemy pary rola/osoba gotowym tekstem.
    formData.delete("obsadaPzssRola");
    formData.delete("obsadaPzssOsoba");
    for (const { funkcja, osoba } of readObsadaPzssRows(createObsadaPzssRows)) {
      formData.append("obsadaPzssRola", funkcja);
      formData.append("obsadaPzssOsoba", osoba);
    }

    const response = await fetch("/.netlify/functions/zawody", {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Błąd zgłoszenia.");

    createNote.textContent = "Zgłoszono zawody. Czekają na akceptację związku.";
    createNote.classList.add("ok");
    createForm.reset();
    resetCreateObsadaPzssRows();
    loadOwnCompetitions();
  } catch (error) {
    createNote.textContent = error.message;
  }
});

const renderNotes = (uwagi = []) => {
  if (!uwagi.length) return "";
  return `<div class="notes-list">${uwagi
    .map(
      (note) =>
        `<p class="note"><strong>${note.autor === "biuro" ? "Związek" : "Klub"}:</strong> ${escapeHtml(note.tekst)}</p>`,
    )
    .join("")}</div>`;
};

const renderActions = (competition) => {
  if (competition.status === "do_poprawy") {
    return `
      <form class="inline-form resubmit-form" data-id="${competition.id}">
        <label class="field">
          Nowy regulamin (PDF)
          <input type="file" name="regulamin" accept="application/pdf" />
        </label>
        <label class="field">
          Komentarz do związku (opcjonalnie)
          <input type="text" name="tekst" placeholder="Co zostało poprawione" />
        </label>
        <button class="button gold" type="submit">Zgłoś poprawiony regulamin</button>
      </form>
      <p class="form-note resubmit-note"></p>
    `;
  }

  if (competition.status === "zaakceptowane") {
    return `
      <form class="inline-form results-form" data-id="${competition.id}">
        <label class="field">
          Link do wyników (PDF w chmurze)
          <input type="url" name="link" placeholder="https://…" required />
        </label>
        <button class="button primary" type="submit">Dodaj wyniki</button>
      </form>
      <p class="form-note results-note"></p>
    `;
  }

  return "";
};

const renderRegulationLink = (competition) => {
  if (!competition.regulamin?.length) return "";
  const latest = competition.regulamin[competition.regulamin.length - 1];
  return `<p class="competition-meta"><a href="/.netlify/functions/zawody-plik?key=${encodeURIComponent(
    latest.key,
  )}&t=${encodeURIComponent(getToken())}" target="_blank" rel="noopener">Regulamin (wersja ${latest.version}) ↗</a></p>`;
};

// Obsada wymagana przez regulamin PZSS — klub wpisuje ją przy zgłaszaniu albo
// (częściej) później, gdy wie już, kto będzie prowadził zawody. Dlatego poza
// polami na formularzu zgłoszenia jest też edytowalna sekcja na każdej karcie
// własnego zgłoszenia, dopóki zawody nie są odwołane/zrealizowane.
const renderObsadaPzssSection = (competition) => {
  const list = competition.obsadaPzss || [];
  const listHtml = list.length
    ? `<ul class="obsada-pzss-list">${list
        .map((entry) => `<li>${escapeHtml(entry.funkcja)}: ${escapeHtml(entry.osoba)}</li>`)
        .join("")}</ul>`
    : `<p class="competition-meta">Nie podano jeszcze obsady wymaganej przez regulamin PZSS.</p>`;

  const editable = !["odwolane", "zrealizowane"].includes(competition.status);
  if (!editable) {
    return `<div class="obsada-pzss-section"><strong>Obsada wymagana przez regulamin PZSS</strong>${listHtml}</div>`;
  }

  const rows = list.length
    ? list.map((entry) => obsadaPzssRowHtml(entry.funkcja, entry.osoba)).join("")
    : obsadaPzssRowHtml();

  return `
    <details class="obsada-pzss-section">
      <summary><strong>Obsada wymagana przez regulamin PZSS</strong> (kliknij, aby edytować)</summary>
      ${listHtml}
      <form class="obsada-pzss-edit-form" data-id="${competition.id}">
        <div class="obsada-pzss-rows">${rows}</div>
        <button type="button" class="button outline small add-obsada-pzss-row">+ Dodaj funkcję</button>
        <button class="button outline" type="submit">Zapisz obsadę PZSS</button>
      </form>
      <p class="form-note obsada-pzss-note"></p>
    </details>
  `;
};

const renderCard = (competition) => `
  <article class="competition-card">
    <div class="competition-card-head">
      <div>
        <h3>${escapeHtml(competition.nazwa)}</h3>
        <p class="competition-meta">${escapeHtml((competition.dyscypliny || []).join(", "))} · ${escapeHtml(competition.miejsce)}</p>
        <p class="competition-meta">${competition.terminOd} – ${competition.terminDo}</p>
      </div>
      <span class="badge ${competition.status}">${STATUS_LABELS[competition.status] || competition.status}</span>
    </div>
    ${renderRegulationLink(competition)}
    ${renderNotes(competition.uwagi)}
    ${renderObsadaPzssSection(competition)}
    ${renderActions(competition)}
  </article>
`;

const attachCardHandlers = () => {
  document.querySelectorAll(".resubmit-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = form.nextElementSibling;
      note.textContent = "Wysyłanie…";
      try {
        const formData = new FormData(form);
        formData.set("id", form.dataset.id);
        const response = await fetch("/.netlify/functions/zawody-popraw", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Błąd.");
        note.textContent = "Zgłoszono ponownie.";
        note.classList.add("ok");
        loadOwnCompetitions();
      } catch (error) {
        note.textContent = error.message;
      }
    });
  });

  document.querySelectorAll(".obsada-pzss-edit-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const note = form.nextElementSibling;
      note.textContent = "Zapisywanie…";
      try {
        const obsadaPzss = readObsadaPzssRows(form.querySelector(".obsada-pzss-rows"));

        await apiFetch("/.netlify/functions/zawody-obsada-pzss", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: form.dataset.id, obsadaPzss }),
        });
        note.textContent = "Zapisano obsadę PZSS.";
        note.classList.add("ok");
        loadOwnCompetitions();
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
        loadOwnCompetitions();
      } catch (error) {
        note.textContent = error.message;
      }
    });
  });
};

const loadOwnCompetitions = async () => {
  try {
    const data = await apiFetch("/.netlify/functions/zawody");
    const klub = getKlub();
    const own = (data.groups || [])
      .flatMap((group) => group.competitions)
      .filter((competition) => competition.klubId === klub?.id)
      .sort((a, b) => new Date(b.terminOd) - new Date(a.terminOd));

    if (!own.length) {
      ownList.innerHTML = `<p class="empty-state">Nie zgłoszono jeszcze żadnych zawodów.</p>`;
      return;
    }

    ownList.innerHTML = `<div class="competition-list">${own.map(renderCard).join("")}</div>`;
    attachCardHandlers();
  } catch (error) {
    ownList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
};

if (getToken() && getKlub()) {
  showPanel();
  loadOwnCompetitions();
} else {
  showLogin();
}
