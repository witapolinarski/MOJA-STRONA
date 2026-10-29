const STATUS_LABELS = {
  zgloszone: "Zgłoszone",
  do_poprawy: "Do poprawy",
  zaakceptowane: "Zaakceptowane",
  odwolane: "Odwołane",
  zrealizowane: "Zrealizowane",
};

const calendarRoot = document.getElementById("calendar-root");
const filterRok = document.getElementById("filter-rok");
const filterDyscyplina = document.getElementById("filter-dyscyplina");
const filterStatus = document.getElementById("filter-status");

let allGroups = [];

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

const formatDateRange = (od, doD) => {
  const fmt = (value) => new Date(value).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (od === doD) return fmt(od);
  return `${fmt(od)} – ${fmt(doD)}`;
};

const renderObsada = (obsada) => {
  const entries = [
    ["Sędzia główny", obsada?.sedziaGlowny],
    ["Delegat techniczny", obsada?.delegatTechniczny],
    ["Obserwator", obsada?.obserwator],
  ].filter(([, person]) => person);

  if (!entries.length) return "";

  return `<div class="obsada-list">${entries
    .map(([role, person]) => `<span><strong>${escapeHtml(role)}:</strong> ${escapeHtml(person.imieNazwisko)}</span>`)
    .join("")}</div>`;
};

const renderCard = (competition) => {
  const statusClass = competition.status;
  const resultsLink =
    competition.status === "zrealizowane" && competition.wyniki?.link
      ? `<p class="competition-meta"><a href="${escapeHtml(competition.wyniki.link)}" target="_blank" rel="noopener">Wyniki zawodów ↗</a></p>`
      : "";

  const regulationLink = competition.regulamin?.length
    ? `<p class="competition-meta"><a href="/.netlify/functions/zawody-plik?key=${encodeURIComponent(
        competition.regulamin[competition.regulamin.length - 1].key,
      )}" target="_blank" rel="noopener">Regulamin zawodów (PDF) ↗</a></p>`
    : "";

  return `
    <article class="competition-card">
      <div class="competition-card-head">
        <div>
          <h3>${escapeHtml(competition.nazwa)}</h3>
          <p class="competition-meta">${escapeHtml(competition.dyscyplina)} · ${escapeHtml(competition.klubNazwa)}</p>
          <p class="competition-meta">${formatDateRange(competition.terminOd, competition.terminDo)} · ${escapeHtml(competition.miejsce)}</p>
        </div>
        <span class="badge ${statusClass}">${STATUS_LABELS[competition.status] || competition.status}</span>
      </div>
      ${regulationLink}
      ${resultsLink}
      ${renderObsada(competition.obsada)}
    </article>
  `;
};

const populateFilterOptions = (groups) => {
  const years = groups.map((group) => group.year);
  filterRok.innerHTML =
    `<option value="">Wszystkie lata</option>` +
    years.map((year) => `<option value="${year}">${year}</option>`).join("");

  const disciplines = new Set();
  for (const group of groups) {
    for (const competition of group.competitions) disciplines.add(competition.dyscyplina);
  }
  filterDyscyplina.innerHTML =
    `<option value="">Wszystkie</option>` +
    [...disciplines].sort().map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
};

const applyFiltersAndRender = () => {
  const rok = filterRok.value;
  const dyscyplina = filterDyscyplina.value;
  const status = filterStatus.value;

  const groups = allGroups
    .filter((group) => !rok || String(group.year) === rok)
    .map((group) => ({
      year: group.year,
      competitions: group.competitions.filter(
        (competition) =>
          (!dyscyplina || competition.dyscyplina === dyscyplina) &&
          (!status || competition.status === status),
      ),
    }))
    .filter((group) => group.competitions.length > 0);

  if (!groups.length) {
    calendarRoot.innerHTML = `<p class="empty-state">Brak zawodów spełniających wybrane kryteria.</p>`;
    return;
  }

  calendarRoot.innerHTML = groups
    .map(
      (group) => `
        <section class="year-group">
          <h2>${group.year}</h2>
          <div class="competition-list">${group.competitions.map(renderCard).join("")}</div>
        </section>
      `,
    )
    .join("");
};

const loadCalendar = async () => {
  try {
    const response = await fetch("/.netlify/functions/zawody");
    if (!response.ok) throw new Error("Błąd wczytywania kalendarza.");
    const data = await response.json();
    allGroups = data.groups || [];
    populateFilterOptions(allGroups);
    applyFiltersAndRender();
  } catch (error) {
    calendarRoot.innerHTML = `<p class="empty-state">Nie udało się wczytać kalendarza. Odśwież stronę.</p>`;
    console.error(error);
  }
};

filterRok.addEventListener("change", applyFiltersAndRender);
filterDyscyplina.addEventListener("change", applyFiltersAndRender);
filterStatus.addEventListener("change", applyFiltersAndRender);

loadCalendar();
