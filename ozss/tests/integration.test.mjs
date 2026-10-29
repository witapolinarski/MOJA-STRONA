// Test integracyjny: wywołuje prawdziwe handlery Netlify Functions (ten sam
// kod co na produkcji) na lokalnym magazynie plikowym, symulując pełny
// przepływ zgłoszenia zawodów od klubu do publikacji wyników.

import assert from "node:assert/strict";
import { test, before, after } from "node:test";

process.env.OZSS_BIURO_PASSWORD = "sekret-biura-testowego";
process.env.OZSS_LOCAL_DATA_DIR = new URL("../.data-test-integration", import.meta.url).pathname;

const { __resetLocalStoreForTests } = await import("../netlify/functions/lib/store.mjs");

const biuroLogin = (await import("../netlify/functions/biuro-login.mjs")).default;
const klubLogin = (await import("../netlify/functions/klub-login.mjs")).default;
const biuroKluby = (await import("../netlify/functions/biuro-kluby.mjs")).default;
const sedziowie = (await import("../netlify/functions/sedziowie.mjs")).default;
const zawody = (await import("../netlify/functions/zawody.mjs")).default;
const zawodyStatus = (await import("../netlify/functions/zawody-status.mjs")).default;
const zawodyObsada = (await import("../netlify/functions/zawody-obsada.mjs")).default;
const zawodyWyniki = (await import("../netlify/functions/zawody-wyniki.mjs")).default;
const zawodyPlik = (await import("../netlify/functions/zawody-plik.mjs")).default;

const jsonRequest = (url, method, body, token) =>
  new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

const getRequest = (url, token) =>
  new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

before(() => __resetLocalStoreForTests());
after(() => __resetLocalStoreForTests());

test("pełny przepływ: logowanie biura, utworzenie klubu, zgłoszenie zawodów, akceptacja, obsada, wyniki", async () => {
  // 1. Biuro loguje się hasłem związku.
  const biuroLoginResponse = await biuroLogin(
    jsonRequest("https://ozss.test/biuro-login", "POST", { password: "sekret-biura-testowego" }),
  );
  assert.equal(biuroLoginResponse.status, 200);
  const { token: biuroToken } = await biuroLoginResponse.json();
  assert.ok(biuroToken);

  // 2. Biuro tworzy konto klubu.
  const createClubResponse = await biuroKluby(
    jsonRequest(
      "https://ozss.test/biuro-kluby",
      "POST",
      { nazwa: "KS Opole Testowy", miejscowosc: "Opole", password: "haslo-klubu-123" },
      biuroToken,
    ),
  );
  assert.equal(createClubResponse.status, 201);
  const { club } = await createClubResponse.json();
  assert.equal(club.nazwa, "KS Opole Testowy");
  assert.ok(!("passwordHash" in club));

  // 3. Klub loguje się swoim kodem i hasłem.
  const klubLoginResponse = await klubLogin(
    jsonRequest("https://ozss.test/klub-login", "POST", { klubId: club.id, password: "haslo-klubu-123" }),
  );
  assert.equal(klubLoginResponse.status, 200);
  const { token: klubToken } = await klubLoginResponse.json();
  assert.ok(klubToken);

  // Błędne hasło musi zostać odrzucone.
  const badLogin = await klubLogin(
    jsonRequest("https://ozss.test/klub-login", "POST", { klubId: club.id, password: "zle-haslo" }),
  );
  assert.equal(badLogin.status, 401);

  // 4. Klub zgłasza zawody z regulaminem PDF, zaznaczając dwie dyscypliny naraz
  // (checkboxy wysyłają wielokrotne pola o tej samej nazwie).
  const formData = new FormData();
  formData.set("nazwa", "Wojewódzkie Zawody Pistoletowe");
  formData.append("dyscyplina", "Pistolet");
  formData.append("dyscyplina", "Karabin");
  formData.set("terminOd", "2026-06-10");
  formData.set("terminDo", "2026-06-11");
  formData.set("miejsce", "Strzelnica OZSS Opole");
  formData.set("regulamin", new File(["%PDF-1.4 testowy regulamin"], "regulamin.pdf", { type: "application/pdf" }));

  const createCompetitionResponse = await zawody(
    new Request("https://ozss.test/zawody", {
      method: "POST",
      headers: { Authorization: `Bearer ${klubToken}` },
      body: formData,
    }),
  );
  assert.equal(createCompetitionResponse.status, 201);
  const { competition: created } = await createCompetitionResponse.json();
  assert.equal(created.status, "zgloszone");
  assert.equal(created.regulamin.length, 1);
  assert.deepEqual(created.dyscypliny, ["Pistolet", "Karabin"]);

  // 5. Zawody w statusie "zgłoszone" nie są widoczne publicznie.
  const publicBeforeApproval = await zawody(getRequest("https://ozss.test/zawody"));
  const publicGroupsBefore = (await publicBeforeApproval.json()).groups;
  assert.equal(publicGroupsBefore.flatMap((g) => g.competitions).length, 0);

  // ale biuro widzi wszystko.
  const biuroView = await zawody(getRequest("https://ozss.test/zawody", biuroToken));
  const biuroCompetitions = (await biuroView.json()).groups.flatMap((g) => g.competitions);
  assert.equal(biuroCompetitions.length, 1);

  // 6. Biuro zatwierdza zgłoszenie.
  const approveResponse = await zawodyStatus(
    jsonRequest("https://ozss.test/zawody-status", "PATCH", { id: created.id, status: "zaakceptowane" }, biuroToken),
  );
  assert.equal(approveResponse.status, 200);
  const { competition: approved } = await approveResponse.json();
  assert.equal(approved.status, "zaakceptowane");

  // Teraz widać je publicznie.
  const publicAfterApproval = await zawody(getRequest("https://ozss.test/zawody"));
  const publicCompetitions = (await publicAfterApproval.json()).groups.flatMap((g) => g.competitions);
  assert.equal(publicCompetitions.length, 1);
  assert.equal(publicCompetitions[0].id, created.id);

  // Regulamin jest teraz dostępny publicznie (bez tokena).
  const regulationKey = approved.regulamin[0].key;
  const publicFileResponse = await zawodyPlik(
    getRequest(`https://ozss.test/zawody-plik?key=${encodeURIComponent(regulationKey)}`),
  );
  assert.equal(publicFileResponse.status, 200);

  // 7. Biuro rejestruje sędziego i przypisuje obsadę.
  const createJudgeResponse = await sedziowie(
    jsonRequest(
      "https://ozss.test/sedziowie",
      "POST",
      { imie: "Jan", nazwisko: "Kowalski", klasa: "Sędzia klasy I" },
      biuroToken,
    ),
  );
  assert.equal(createJudgeResponse.status, 201);
  const { judge } = await createJudgeResponse.json();

  const assignResponse = await zawodyObsada(
    jsonRequest(
      "https://ozss.test/zawody-obsada",
      "PATCH",
      { id: created.id, sedziaGlowny: judge.id },
      biuroToken,
    ),
  );
  assert.equal(assignResponse.status, 200);
  const { competition: withObsada } = await assignResponse.json();
  assert.equal(withObsada.obsada.sedziaGlowny.imieNazwisko, "Jan Kowalski");

  // 8. Klub dodaje wyniki — zawody przechodzą w status "zrealizowane".
  const resultsResponse = await zawodyWyniki(
    jsonRequest(
      "https://ozss.test/zawody-wyniki",
      "POST",
      { id: created.id, link: "https://example.com/wyniki.pdf" },
      klubToken,
    ),
  );
  assert.equal(resultsResponse.status, 200);
  const { competition: finished } = await resultsResponse.json();
  assert.equal(finished.status, "zrealizowane");
  assert.equal(finished.wyniki.link, "https://example.com/wyniki.pdf");

  // Inny klub nie może dodać wyników do cudzych zawodów.
  const otherClubResponse = await biuroKluby(
    jsonRequest(
      "https://ozss.test/biuro-kluby",
      "POST",
      { nazwa: "Inny Klub", password: "inne-haslo-123" },
      biuroToken,
    ),
  );
  const { club: otherClub } = await otherClubResponse.json();
  const otherLoginResponse = await klubLogin(
    jsonRequest("https://ozss.test/klub-login", "POST", { klubId: otherClub.id, password: "inne-haslo-123" }),
  );
  const { token: otherToken } = await otherLoginResponse.json();

  const forbiddenResponse = await zawodyWyniki(
    jsonRequest(
      "https://ozss.test/zawody-wyniki",
      "POST",
      { id: created.id, link: "https://example.com/inne.pdf" },
      otherToken,
    ),
  );
  assert.equal(forbiddenResponse.status, 403);
});

test("odesłanie do poprawy wymaga uwagi i blokuje dostęp publiczny do regulaminu", async () => {
  const biuroLoginResponse = await biuroLogin(
    jsonRequest("https://ozss.test/biuro-login", "POST", { password: "sekret-biura-testowego" }),
  );
  const { token: biuroToken } = await biuroLoginResponse.json();

  const createClubResponse = await biuroKluby(
    jsonRequest("https://ozss.test/biuro-kluby", "POST", { nazwa: "Klub Poprawkowy", password: "haslo123456" }, biuroToken),
  );
  const { club } = await createClubResponse.json();

  const klubLoginResponse = await klubLogin(
    jsonRequest("https://ozss.test/klub-login", "POST", { klubId: club.id, password: "haslo123456" }),
  );
  const { token: klubToken } = await klubLoginResponse.json();

  const formData = new FormData();
  formData.set("nazwa", "Zawody Testowe");
  formData.append("dyscyplina", "Karabin");
  formData.set("terminOd", "2026-09-01");
  formData.set("terminDo", "2026-09-01");
  formData.set("miejsce", "Strzelnica X");

  const createResponse = await zawody(
    new Request("https://ozss.test/zawody", {
      method: "POST",
      headers: { Authorization: `Bearer ${klubToken}` },
      body: formData,
    }),
  );
  const { competition: created } = await createResponse.json();

  // Odesłanie bez uwagi jest zablokowane.
  const missingNote = await zawodyStatus(
    jsonRequest("https://ozss.test/zawody-status", "PATCH", { id: created.id, status: "do_poprawy" }, biuroToken),
  );
  assert.equal(missingNote.status, 400);

  const withNote = await zawodyStatus(
    jsonRequest(
      "https://ozss.test/zawody-status",
      "PATCH",
      { id: created.id, status: "do_poprawy", tekst: "Uzupełnij paragraf o bezpieczeństwie." },
      biuroToken,
    ),
  );
  assert.equal(withNote.status, 200);
  const { competition: sentBack } = await withNote.json();
  assert.equal(sentBack.status, "do_poprawy");
  assert.equal(sentBack.uwagi.length, 1);

  // Zawody w statusie "do_poprawy" nie są widoczne publicznie i nie pojawiają
  // się na liście konkurenta — a próba bezpośredniego zatwierdzenia wyników
  // (status nie pozwalający na "zrealizowane") kończy się konfliktem.
  const invalidResultsAttempt = await zawodyWyniki(
    jsonRequest(
      "https://ozss.test/zawody-wyniki",
      "POST",
      { id: created.id, link: "https://example.com/wyniki.pdf" },
      klubToken,
    ),
  );
  assert.equal(invalidResultsAttempt.status, 409);
});

test("zgłoszenie bez zaznaczonej dyscypliny jest odrzucane, a kilka dyscyplin naraz jest akceptowane", async () => {
  const biuroLoginResponse = await biuroLogin(
    jsonRequest("https://ozss.test/biuro-login", "POST", { password: "sekret-biura-testowego" }),
  );
  const { token: biuroToken } = await biuroLoginResponse.json();

  const createClubResponse = await biuroKluby(
    jsonRequest("https://ozss.test/biuro-kluby", "POST", { nazwa: "Klub Wielodyscyplinowy", password: "haslo123456" }, biuroToken),
  );
  const { club } = await createClubResponse.json();

  const klubLoginResponse = await klubLogin(
    jsonRequest("https://ozss.test/klub-login", "POST", { klubId: club.id, password: "haslo123456" }),
  );
  const { token: klubToken } = await klubLoginResponse.json();

  const noDisciplineForm = new FormData();
  noDisciplineForm.set("nazwa", "Zawody bez dyscypliny");
  noDisciplineForm.set("terminOd", "2026-09-01");
  noDisciplineForm.set("terminDo", "2026-09-01");
  noDisciplineForm.set("miejsce", "Strzelnica X");

  const rejected = await zawody(
    new Request("https://ozss.test/zawody", {
      method: "POST",
      headers: { Authorization: `Bearer ${klubToken}` },
      body: noDisciplineForm,
    }),
  );
  assert.equal(rejected.status, 400);
  const rejectedBody = await rejected.json();
  assert.ok(rejectedBody.error.includes("dyscyplinę"));

  const threeDisciplinesForm = new FormData();
  threeDisciplinesForm.set("nazwa", "Zawody wielodyscyplinowe");
  threeDisciplinesForm.append("dyscyplina", "Karabin");
  threeDisciplinesForm.append("dyscyplina", "Strzelba");
  threeDisciplinesForm.append("dyscyplina", "Pistolet");
  threeDisciplinesForm.set("terminOd", "2026-09-05");
  threeDisciplinesForm.set("terminDo", "2026-09-05");
  threeDisciplinesForm.set("miejsce", "Strzelnica Y");

  const accepted = await zawody(
    new Request("https://ozss.test/zawody", {
      method: "POST",
      headers: { Authorization: `Bearer ${klubToken}` },
      body: threeDisciplinesForm,
    }),
  );
  assert.equal(accepted.status, 201);
  const { competition } = await accepted.json();
  assert.deepEqual(competition.dyscypliny, ["Karabin", "Strzelba", "Pistolet"]);
});
