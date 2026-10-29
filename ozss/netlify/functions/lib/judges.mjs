import { getJudgesStore } from "./store.mjs";

export const JUDGE_CLASSES = Object.freeze([
  "Sędzia klasy III",
  "Sędzia klasy II",
  "Sędzia klasy I",
  "Sędzia klasy państwowej",
]);

export const listJudges = async () => {
  const store = getJudgesStore();
  const { blobs } = await store.list();
  const judges = await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" })));
  return judges
    .filter(Boolean)
    .sort((a, b) => String(a.nazwisko).localeCompare(String(b.nazwisko), "pl"));
};

export const getJudge = async (id) => {
  const store = getJudgesStore();
  return store.get(id, { type: "json" });
};

export const createJudge = async ({ imie, nazwisko, klasa = "", telefon = "", email = "", licencjaDo = "" }) => {
  const store = getJudgesStore();
  const id = `sedzia-${Date.now()}-${Math.round(Math.random() * 1000)}`;

  const judge = {
    id,
    imie: String(imie).trim(),
    nazwisko: String(nazwisko).trim(),
    klasa: String(klasa).trim(),
    telefon: String(telefon).trim(),
    email: String(email).trim(),
    licencjaDo: String(licencjaDo || "").trim(),
    aktywny: true,
    createdAt: new Date().toISOString(),
  };

  await store.setJSON(id, judge);
  return judge;
};

export const updateJudge = async (id, patch) => {
  const store = getJudgesStore();
  const judge = await store.get(id, { type: "json" });
  if (!judge) return null;

  const next = {
    ...judge,
    imie: patch.imie !== undefined ? String(patch.imie).trim() : judge.imie,
    nazwisko: patch.nazwisko !== undefined ? String(patch.nazwisko).trim() : judge.nazwisko,
    klasa: patch.klasa !== undefined ? String(patch.klasa).trim() : judge.klasa,
    telefon: patch.telefon !== undefined ? String(patch.telefon).trim() : judge.telefon,
    email: patch.email !== undefined ? String(patch.email).trim() : judge.email,
    licencjaDo: patch.licencjaDo !== undefined ? String(patch.licencjaDo).trim() : judge.licencjaDo,
    aktywny: patch.aktywny !== undefined ? Boolean(patch.aktywny) : judge.aktywny,
  };

  await store.setJSON(id, next);
  return next;
};
