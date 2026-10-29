import assert from "node:assert/strict";
import { test, before, after } from "node:test";

process.env.OZSS_LOCAL_DATA_DIR = new URL("../.data-test-clubs", import.meta.url).pathname;

const { __resetLocalStoreForTests } = await import("../netlify/functions/lib/store.mjs");
const { createClub, listClubs, toPublicClub, updateClub, verifyClubLogin } = await import(
  "../netlify/functions/lib/clubs.mjs"
);

before(() => __resetLocalStoreForTests());
after(() => __resetLocalStoreForTests());

test("createClub tworzy czytelny kod klubu z polskich znaków", async () => {
  const club = await createClub({ nazwa: "KS Sokół Opole", password: "haslo123456" });
  assert.equal(club.id, "ks-sokol-opole");
});

test("createClub dodaje numeryczny sufiks przy konflikcie nazw", async () => {
  const first = await createClub({ nazwa: "Klub Testowy", password: "haslo123456" });
  const second = await createClub({ nazwa: "Klub Testowy", password: "haslo654321" });
  assert.equal(first.id, "klub-testowy");
  assert.equal(second.id, "klub-testowy-1");
});

test("verifyClubLogin działa tylko z prawidłowym hasłem i aktywnym kontem", async () => {
  const club = await createClub({ nazwa: "Klub Logowania", password: "poprawne-haslo" });

  assert.ok(await verifyClubLogin(club.id, "poprawne-haslo"));
  assert.equal(await verifyClubLogin(club.id, "zle-haslo"), null);

  await updateClub(club.id, { aktywny: false });
  assert.equal(await verifyClubLogin(club.id, "poprawne-haslo"), null);
});

test("toPublicClub nigdy nie zwraca passwordHash, choć rekord wewnętrzny go zawiera", async () => {
  const club = await createClub({ nazwa: "Klub Prywatny", password: "tajne-haslo-123" });

  assert.ok("passwordHash" in club, "rekord z magazynu powinien mieć hash");
  assert.ok(!("passwordHash" in toPublicClub(club)), "wersja publiczna nie powinna mieć hasha");

  const clubs = await listClubs();
  for (const entry of clubs) {
    assert.ok(!("passwordHash" in toPublicClub(entry)));
  }
});
