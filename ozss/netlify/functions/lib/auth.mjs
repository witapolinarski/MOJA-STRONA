// Logowanie i tokeny dla kalendarza OZSS.
//
// Dwie role:
//  - "biuro"  — zarząd / biuro związku, hasło z OZSS_BIURO_PASSWORD
//  - "klub"   — klub zrzeszony, konto (kod + hasło) tworzone przez biuro

import crypto from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const getTokenSecret = () =>
  process.env.OZSS_TOKEN_SECRET || process.env.OZSS_BIURO_PASSWORD || "dev-secret-zmien-w-produkcji";

const signPayload = (data) => {
  const secret = getTokenSecret();
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

const readPayload = (token) => {
  const secret = getTokenSecret();
  if (!token) return null;

  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature !== expected) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
};

export const createBiuroToken = () => signPayload({ role: "biuro", exp: Date.now() + TOKEN_TTL_MS });

export const createKlubToken = (klubId) =>
  signPayload({ role: "klub", klubId, exp: Date.now() + TOKEN_TTL_MS });

export const verifyBiuroPassword = (password) => {
  const expected = process.env.OZSS_BIURO_PASSWORD || "";
  return Boolean(expected) && String(password || "") === expected;
};

// Hasła klubów: PBKDF2 z losową solą, zapisywane jako "sól:hash" w rejestrze klubów.
export const hashClubPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
};

export const verifyClubPassword = (password, stored) => {
  if (!stored || !String(stored).includes(":")) return false;
  const [salt, hash] = String(stored).split(":");
  const candidate = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
};

export const getBearerToken = (request) => {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();

  // Pliki otwierane w nowej karcie (<a target="_blank">) nie mogą wysłać
  // nagłówka Authorization, więc dla GET akceptujemy token też w query string.
  try {
    const token = new URL(request.url).searchParams.get("t");
    if (token) return token;
  } catch {
    // ignorujemy nieprawidłowy URL
  }
  return "";
};

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const requireBiuro = (request) => {
  const token = getBearerToken(request);
  const data = readPayload(token);
  if (!data || data.role !== "biuro") {
    return { ok: false, response: jsonResponse({ error: "Brak autoryzacji biura związku." }, 401) };
  }
  return { ok: true };
};

export const requireKlub = (request) => {
  const token = getBearerToken(request);
  const data = readPayload(token);
  if (!data || data.role !== "klub" || !data.klubId) {
    return { ok: false, response: jsonResponse({ error: "Brak autoryzacji klubu." }, 401) };
  }
  return { ok: true, klubId: data.klubId };
};

// Dowolna z dwóch ról — przydatne tam, gdzie i biuro, i klub mają dostęp,
// ale z różnym zakresem widoczności danych.
export const requireBiuroOrKlub = (request) => {
  const token = getBearerToken(request);
  const data = readPayload(token);
  if (!data || !["biuro", "klub"].includes(data.role)) {
    return { ok: false, response: jsonResponse({ error: "Brak autoryzacji." }, 401) };
  }
  return { ok: true, role: data.role, klubId: data.klubId || null };
};

// Nie wymaga logowania — używane na publicznym kalendarzu, który mimo to
// pokazuje więcej danych zalogowanemu biuru / klubowi (np. zgłoszenia
// czekające na akceptację).
export const detectRole = (request) => {
  const token = getBearerToken(request);
  const data = readPayload(token);
  if (data?.role === "biuro") return { role: "biuro", klubId: null };
  if (data?.role === "klub" && data.klubId) return { role: "klub", klubId: data.klubId };
  return { role: "public", klubId: null };
};
