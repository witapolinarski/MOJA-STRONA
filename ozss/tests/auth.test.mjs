import assert from "node:assert/strict";
import { test } from "node:test";

process.env.OZSS_BIURO_PASSWORD = "haslo-testowe-123";

const {
  createBiuroToken,
  createKlubToken,
  hashClubPassword,
  requireBiuro,
  requireKlub,
  verifyBiuroPassword,
  verifyClubPassword,
} = await import("../netlify/functions/lib/auth.mjs");

test("verifyBiuroPassword porównuje z OZSS_BIURO_PASSWORD", () => {
  assert.ok(verifyBiuroPassword("haslo-testowe-123"));
  assert.ok(!verifyBiuroPassword("zle-haslo"));
});

test("hashClubPassword + verifyClubPassword działają razem, a hash nigdy nie jest w czystym tekście", () => {
  const stored = hashClubPassword("tajne-haslo");
  assert.ok(!stored.includes("tajne-haslo"));
  assert.ok(verifyClubPassword("tajne-haslo", stored));
  assert.ok(!verifyClubPassword("inne-haslo", stored));
});

const mockRequest = (token) =>
  new Request("https://example.com/api", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

test("requireBiuro przepuszcza prawidłowy token biura", () => {
  const token = createBiuroToken();
  assert.equal(requireBiuro(mockRequest(token)).ok, true);
});

test("requireBiuro odrzuca token klubu i brak tokena", () => {
  const klubToken = createKlubToken("klub-x");
  assert.equal(requireBiuro(mockRequest(klubToken)).ok, false);
  assert.equal(requireBiuro(mockRequest()).ok, false);
});

test("requireKlub zwraca klubId z tokena", () => {
  const token = createKlubToken("klub-opole");
  const result = requireKlub(mockRequest(token));
  assert.equal(result.ok, true);
  assert.equal(result.klubId, "klub-opole");
});

test("tokeny podpisane innym sekretem są odrzucane", async () => {
  const token = createBiuroToken();
  process.env.OZSS_BIURO_PASSWORD = "inne-haslo";
  assert.equal(requireBiuro(mockRequest(token)).ok, false);
  process.env.OZSS_BIURO_PASSWORD = "haslo-testowe-123";
});
