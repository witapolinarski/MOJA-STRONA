import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STATUSES,
  addNote,
  addRegulationVersion,
  assignObsada,
  attachResults,
  canTransition,
  createCompetitionRecord,
  filterForKlub,
  filterForPublic,
  groupByYear,
  InvalidTransitionError,
  sortByTermin,
  transitionStatus,
  validateCompetitionInput,
  yearOfCompetition,
} from "../netlify/functions/lib/competitions.mjs";

const klub = { id: "klub-test", nazwa: "KS Testowy" };

const validInput = () => ({
  nazwa: "Mistrzostwa Województwa",
  dyscyplina: "Pistolet",
  terminOd: "2026-05-10",
  terminDo: "2026-05-11",
  miejsce: "Strzelnica Opole",
});

test("validateCompetitionInput wymaga wszystkich pól", () => {
  const errors = validateCompetitionInput({});
  assert.ok(errors.length >= 4);
});

test("validateCompetitionInput odrzuca datę końcową wcześniejszą niż początkowa", () => {
  const errors = validateCompetitionInput({ ...validInput(), terminOd: "2026-05-11", terminDo: "2026-05-10" });
  assert.ok(errors.some((error) => error.includes("wcześniejsza")));
});

test("validateCompetitionInput przepuszcza poprawne dane", () => {
  assert.deepEqual(validateCompetitionInput(validInput()), []);
});

test("createCompetitionRecord startuje w statusie zgloszone i liczy rok z terminu", () => {
  const competition = createCompetitionRecord({ id: "zawody-1", input: validInput(), klub });
  assert.equal(competition.status, STATUSES.ZGLOSZONE);
  assert.equal(competition.rok, 2026);
  assert.equal(competition.klubId, klub.id);
  assert.deepEqual(competition.obsada, { sedziaGlowny: null, delegatTechniczny: null, obserwator: null });
});

test("canTransition pilnuje dozwolonej maszyny stanów", () => {
  assert.ok(canTransition(STATUSES.ZGLOSZONE, STATUSES.ZAAKCEPTOWANE));
  assert.ok(canTransition(STATUSES.ZGLOSZONE, STATUSES.DO_POPRAWY));
  assert.ok(!canTransition(STATUSES.ZGLOSZONE, STATUSES.ZREALIZOWANE));
  assert.ok(!canTransition(STATUSES.ODWOLANE, STATUSES.ZAAKCEPTOWANE));
});

test("transitionStatus rzuca InvalidTransitionError dla niedozwolonej zmiany", () => {
  const competition = createCompetitionRecord({ id: "zawody-2", input: validInput(), klub });
  assert.throws(
    () => transitionStatus(competition, STATUSES.ZREALIZOWANE),
    InvalidTransitionError,
  );
});

test("transitionStatus do_poprawy dopisuje uwagę związku", () => {
  const competition = createCompetitionRecord({ id: "zawody-3", input: validInput(), klub });
  const next = transitionStatus(competition, STATUSES.DO_POPRAWY, {
    autor: "biuro",
    tekst: "Uzupełnij paragraf 4.",
  });
  assert.equal(next.status, STATUSES.DO_POPRAWY);
  assert.equal(next.uwagi.length, 1);
  assert.equal(next.uwagi[0].autor, "biuro");
});

test("pełny cykl: zgłoszenie → poprawa → akceptacja → wyniki", () => {
  let competition = createCompetitionRecord({ id: "zawody-4", input: validInput(), klub });

  competition = transitionStatus(competition, STATUSES.DO_POPRAWY, { autor: "biuro", tekst: "Dopisz regulamin." });
  assert.equal(competition.status, STATUSES.DO_POPRAWY);

  competition = addRegulationVersion(competition, { key: "zawody-4/regulamin/1", fileName: "regulamin.pdf" });
  competition = transitionStatus(competition, STATUSES.ZGLOSZONE, { autor: "klub", tekst: "Poprawiono." });
  assert.equal(competition.status, STATUSES.ZGLOSZONE);
  assert.equal(competition.regulamin.length, 1);
  assert.equal(competition.uwagi.length, 2);

  competition = transitionStatus(competition, STATUSES.ZAAKCEPTOWANE, { autor: "biuro" });
  assert.equal(competition.status, STATUSES.ZAAKCEPTOWANE);

  competition = assignObsada(competition, {
    sedziaGlowny: { id: "s1", imieNazwisko: "Jan Kowalski" },
    obserwator: { id: "s2", imieNazwisko: "Anna Nowak" },
  });
  assert.equal(competition.obsada.sedziaGlowny.imieNazwisko, "Jan Kowalski");
  assert.equal(competition.obsada.delegatTechniczny, null);

  competition = attachResults(competition, { link: "https://example.com/wyniki.pdf" });
  assert.equal(competition.status, STATUSES.ZREALIZOWANE);
  assert.equal(competition.wyniki.status, "wgrane");
});

test("attachResults odmawia dla zawodów bez akceptacji", () => {
  const competition = createCompetitionRecord({ id: "zawody-5", input: validInput(), klub });
  assert.throws(() => attachResults(competition, { link: "https://example.com" }), InvalidTransitionError);
});

test("filterForPublic skrywa zgłoszenia oczekujące i do poprawy", () => {
  const base = createCompetitionRecord({ id: "zawody-6", input: validInput(), klub });
  const accepted = transitionStatus(base, STATUSES.ZAAKCEPTOWANE);
  const pending = base;

  const result = filterForPublic([pending, accepted]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, STATUSES.ZAAKCEPTOWANE);
});

test("filterForKlub zwraca tylko zawody danego klubu", () => {
  const a = createCompetitionRecord({ id: "a", input: validInput(), klub: { id: "klub-a", nazwa: "A" } });
  const b = createCompetitionRecord({ id: "b", input: validInput(), klub: { id: "klub-b", nazwa: "B" } });
  assert.deepEqual(filterForKlub([a, b], "klub-a").map((c) => c.id), ["a"]);
});

test("sortByTermin sortuje chronologicznie", () => {
  const early = { ...createCompetitionRecord({ id: "e", input: validInput(), klub }), terminOd: "2026-01-01" };
  const late = { ...createCompetitionRecord({ id: "l", input: validInput(), klub }), terminOd: "2026-12-01" };
  assert.deepEqual(sortByTermin([late, early]).map((c) => c.id), ["e", "l"]);
});

test("groupByYear grupuje i sortuje lata malejąco", () => {
  const y2025 = { ...createCompetitionRecord({ id: "y25", input: validInput(), klub }), rok: 2025, terminOd: "2025-06-01" };
  const y2026 = { ...createCompetitionRecord({ id: "y26", input: validInput(), klub }), rok: 2026, terminOd: "2026-06-01" };
  const groups = groupByYear([y2025, y2026]);
  assert.deepEqual(groups.map((g) => g.year), [2026, 2025]);
});

test("yearOfCompetition wylicza rok z daty początku", () => {
  assert.equal(yearOfCompetition({ terminOd: "2027-03-15" }), 2027);
});

test("addNote odfiltrowuje puste uwagi", () => {
  const competition = createCompetitionRecord({ id: "zawody-7", input: validInput(), klub });
  const next = addNote(competition, { autor: "klub", tekst: "   " });
  assert.equal(next.uwagi.length, 0);
});
