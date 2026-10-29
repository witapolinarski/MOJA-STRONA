// Logika domenowa kalendarza zawodów OZSS — same funkcje czyste (bez I/O),
// żeby dało się je przetestować bez magazynu danych i bez sieci.

export const STATUSES = Object.freeze({
  ZGLOSZONE: "zgloszone",
  DO_POPRAWY: "do_poprawy",
  ZAAKCEPTOWANE: "zaakceptowane",
  ODWOLANE: "odwolane",
  ZREALIZOWANE: "zrealizowane",
});

export const STATUS_LABELS = Object.freeze({
  [STATUSES.ZGLOSZONE]: "Zgłoszone — czeka na związek",
  [STATUSES.DO_POPRAWY]: "Do poprawy — czeka na klub",
  [STATUSES.ZAAKCEPTOWANE]: "Zaakceptowane",
  [STATUSES.ODWOLANE]: "Odwołane",
  [STATUSES.ZREALIZOWANE]: "Zrealizowane",
});

// Statusy widoczne na publicznym kalendarzu związku (bez logowania).
const PUBLIC_STATUSES = new Set([
  STATUSES.ZAAKCEPTOWANE,
  STATUSES.ODWOLANE,
  STATUSES.ZREALIZOWANE,
]);

// Dozwolone przejścia statusów — pilnuje, żeby np. nie dało się "zrealizować"
// zawodów, które nigdy nie zostały zaakceptowane.
const ALLOWED_TRANSITIONS = {
  [STATUSES.ZGLOSZONE]: [STATUSES.ZAAKCEPTOWANE, STATUSES.DO_POPRAWY, STATUSES.ODWOLANE],
  [STATUSES.DO_POPRAWY]: [STATUSES.ZGLOSZONE, STATUSES.ODWOLANE],
  [STATUSES.ZAAKCEPTOWANE]: [STATUSES.ODWOLANE, STATUSES.ZREALIZOWANE],
  [STATUSES.ODWOLANE]: [],
  [STATUSES.ZREALIZOWANE]: [],
};

export const canTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

export const DISCIPLINES = Object.freeze([
  "Pistolet",
  "Karabin",
  "Strzelba (brokowe)",
  "Broń czarnoprochowa",
  "Inne",
]);

const REQUIRED_FIELDS = ["nazwa", "terminOd", "terminDo", "miejsce"];

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(value));

// Zawody mogą obejmować kilka dyscyplin na raz (np. karabin i strzelba
// jednocześnie), więc "dyscyplina" jest zawsze tablicą — przyjmujemy
// zarówno tablicę (checkboxy / formData.getAll), jak i pojedynczy string,
// dla wygody wywołań programistycznych i testów.
export const normalizeDisciplines = (value) => {
  const values = Array.isArray(value) ? value : [value];
  const unique = [];
  for (const raw of values) {
    const trimmed = String(raw || "").trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  return unique;
};

export const validateCompetitionInput = (input = {}) => {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!String(input[field] || "").trim()) errors.push(`Brakuje pola: ${field}`);
  }

  if (normalizeDisciplines(input.dyscypliny).length === 0) {
    errors.push("Wybierz co najmniej jedną dyscyplinę.");
  }

  if (isValidDate(input.terminOd) && isValidDate(input.terminDo)) {
    if (new Date(input.terminDo) < new Date(input.terminOd)) {
      errors.push("Data zakończenia nie może być wcześniejsza niż data początku.");
    }
  } else {
    if (!isValidDate(input.terminOd)) errors.push("Nieprawidłowa data początku zawodów.");
    if (!isValidDate(input.terminDo)) errors.push("Nieprawidłowa data zakończenia zawodów.");
  }

  return errors;
};

export const yearOfCompetition = (competition) =>
  Number(String(competition.terminOd || "").slice(0, 4)) || new Date().getFullYear();

export const createCompetitionRecord = ({ id, input, klub, now = new Date() }) => ({
  id,
  rok: yearOfCompetition(input),
  nazwa: String(input.nazwa).trim(),
  dyscypliny: normalizeDisciplines(input.dyscypliny),
  klubId: klub.id,
  klubNazwa: klub.nazwa,
  terminOd: input.terminOd,
  terminDo: input.terminDo,
  miejsce: String(input.miejsce).trim(),
  opis: String(input.opis || "").trim(),
  status: STATUSES.ZGLOSZONE,
  uwagi: [],
  regulamin: [],
  obsada: { sedziaGlowny: null, delegatTechniczny: null, obserwator: null },
  wyniki: { status: "brak", link: "", opis: "", uploadedAt: null },
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

export const addRegulationVersion = (competition, fileMeta, now = new Date()) => ({
  ...competition,
  regulamin: [
    ...competition.regulamin,
    { ...fileMeta, version: competition.regulamin.length + 1, uploadedAt: now.toISOString() },
  ],
  updatedAt: now.toISOString(),
});

export const addNote = (competition, { autor, tekst }, now = new Date()) => ({
  ...competition,
  uwagi: [
    ...competition.uwagi,
    { autor, tekst: String(tekst || "").trim(), data: now.toISOString() },
  ].filter((note) => note.tekst),
  updatedAt: now.toISOString(),
});

export class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`Nie można zmienić statusu z "${from}" na "${to}".`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export const transitionStatus = (competition, toStatus, { autor, tekst } = {}, now = new Date()) => {
  if (!canTransition(competition.status, toStatus)) {
    throw new InvalidTransitionError(competition.status, toStatus);
  }

  let next = { ...competition, status: toStatus, updatedAt: now.toISOString() };
  if (tekst) next = addNote(next, { autor, tekst }, now);
  return next;
};

export const assignObsada = (competition, obsada = {}, now = new Date()) => ({
  ...competition,
  obsada: {
    sedziaGlowny: obsada.sedziaGlowny ?? competition.obsada.sedziaGlowny ?? null,
    delegatTechniczny: obsada.delegatTechniczny ?? competition.obsada.delegatTechniczny ?? null,
    obserwator: obsada.obserwator ?? competition.obsada.obserwator ?? null,
  },
  updatedAt: now.toISOString(),
});

export const attachResults = (competition, { link = "", opis = "" } = {}, now = new Date()) => {
  if (!canTransition(competition.status, STATUSES.ZREALIZOWANE)) {
    throw new InvalidTransitionError(competition.status, STATUSES.ZREALIZOWANE);
  }

  return {
    ...competition,
    status: STATUSES.ZREALIZOWANE,
    wyniki: {
      status: "wgrane",
      link: String(link || "").trim(),
      opis: String(opis || "").trim(),
      uploadedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
};

export const filterForPublic = (competitions) =>
  competitions.filter((competition) => PUBLIC_STATUSES.has(competition.status));

export const filterForKlub = (competitions, klubId) =>
  competitions.filter((competition) => competition.klubId === klubId);

export const sortByTermin = (competitions) =>
  [...competitions].sort((a, b) => new Date(a.terminOd) - new Date(b.terminOd));

export const groupByYear = (competitions) => {
  const groups = new Map();
  for (const competition of competitions) {
    const year = competition.rok || yearOfCompetition(competition);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(competition);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, competitions: sortByTermin(items) }));
};
