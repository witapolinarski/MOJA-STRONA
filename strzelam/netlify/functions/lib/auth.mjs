import crypto from "node:crypto";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const getSecret = () => process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || "";

const signPayload = (data) => {
  const secret = getSecret();
  if (!secret) throw new Error("Brak ADMIN_PASSWORD w zmiennych środowiskowych Netlify.");

  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

const readPayload = (token) => {
  const secret = getSecret();
  if (!secret || !token) return null;

  const [payload, signature] = token.split(".");
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

export const createAdminToken = () =>
  signPayload({ role: "admin", exp: Date.now() + TOKEN_TTL_MS });

export const createMemberToken = (code) =>
  signPayload({ role: "member", code, exp: Date.now() + TOKEN_TTL_MS });

export const verifyAdminToken = (token) => {
  const data = readPayload(token);
  return Boolean(data && data.role === "admin");
};

export const verifyMemberToken = (token) => {
  const data = readPayload(token);
  if (!data || data.role !== "member" || !data.code) return null;
  return data;
};

export const verifyAdminPassword = (password) => {
  const expected = process.env.ADMIN_PASSWORD || "";
  return Boolean(expected) && password === expected;
};

export const getBearerToken = (request) => {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
};

export const requireAdmin = (request) => {
  const token = getBearerToken(request);
  if (!verifyAdminToken(token)) {
    return { ok: false, response: jsonResponse({ error: "Brak autoryzacji administratora." }, 401) };
  }
  return { ok: true };
};

export const requireMember = (request) => {
  const token = getBearerToken(request);
  const data = verifyMemberToken(token);
  if (!data) {
    return { ok: false, response: jsonResponse({ error: "Brak autoryzacji członka." }, 401) };
  }
  return { ok: true, code: data.code };
};

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
