import { getClubsStore } from "./store.mjs";
import { hashClubPassword, verifyClubPassword } from "./auth.mjs";

// Polskie znaki, których nie rozkłada normalizacja NFD (ł, ń itd.),
// tłumaczymy ręcznie, żeby kod klubu był czytelny, np. "Sokół" -> "sokol".
const POLISH_LETTER_MAP = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (char) => POLISH_LETTER_MAP[char] || char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const listClubs = async () => {
  const store = getClubsStore();
  const { blobs } = await store.list();
  const clubs = await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" })));
  return clubs
    .filter(Boolean)
    .sort((a, b) => String(a.nazwa).localeCompare(String(b.nazwa), "pl"));
};

export const getClub = async (id) => {
  const store = getClubsStore();
  return store.get(id, { type: "json" });
};

export const createClub = async ({ nazwa, miejscowosc = "", kontaktEmail = "", kontaktTelefon = "", password }) => {
  const store = getClubsStore();
  const baseId = slugify(nazwa) || `klub-${Date.now()}`;

  let id = baseId;
  let suffix = 1;
  while (await store.get(id, { type: "json" })) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const club = {
    id,
    nazwa: String(nazwa).trim(),
    miejscowosc: String(miejscowosc).trim(),
    kontaktEmail: String(kontaktEmail).trim(),
    kontaktTelefon: String(kontaktTelefon).trim(),
    passwordHash: hashClubPassword(password),
    aktywny: true,
    createdAt: new Date().toISOString(),
  };

  await store.setJSON(id, club);
  return club;
};

export const updateClub = async (id, patch) => {
  const store = getClubsStore();
  const club = await store.get(id, { type: "json" });
  if (!club) return null;

  const next = {
    ...club,
    nazwa: patch.nazwa !== undefined ? String(patch.nazwa).trim() : club.nazwa,
    miejscowosc: patch.miejscowosc !== undefined ? String(patch.miejscowosc).trim() : club.miejscowosc,
    kontaktEmail: patch.kontaktEmail !== undefined ? String(patch.kontaktEmail).trim() : club.kontaktEmail,
    kontaktTelefon: patch.kontaktTelefon !== undefined ? String(patch.kontaktTelefon).trim() : club.kontaktTelefon,
    aktywny: patch.aktywny !== undefined ? Boolean(patch.aktywny) : club.aktywny,
  };

  if (patch.password) next.passwordHash = hashClubPassword(patch.password);

  await store.setJSON(id, next);
  return next;
};

export const verifyClubLogin = async (id, password) => {
  const club = await getClub(id);
  if (!club || club.aktywny === false) return null;
  if (!verifyClubPassword(password, club.passwordHash)) return null;
  return club;
};

export const toPublicClub = (club) => {
  if (!club) return null;
  const { passwordHash, ...rest } = club;
  return rest;
};
