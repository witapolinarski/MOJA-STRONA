export const SOZ_BASE_URL = "https://soz.pzss.org.pl";
export const SOZ_PERSONS_LIST_URL = `${SOZ_BASE_URL}/Club/Persons/List`;

const SOZ_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const parseCookieHeader = (setCookieHeaders = []) => {
  const jar = new Map();

  for (const header of setCookieHeaders) {
    const part = String(header).split(";")[0];
    const index = part.indexOf("=");
    if (index === -1) continue;
    jar.set(part.slice(0, index), part.slice(index + 1));
  }

  return jar;
};

const serializeCookies = (jar) => [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");

const extractVerificationToken = (html) => {
  const match = String(html || "").match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
  return match?.[1] || "";
};

const buildDataTablesPayload = (start = 0, length = 500) => {
  const params = new URLSearchParams();
  params.set("draw", "1");
  params.set("start", String(start));
  params.set("length", String(length));
  params.set("search[value]", "");
  params.set("search[regex]", "false");
  return params;
};

const parseSozPersonRecord = (row) => {
  if (!row) return null;

  if (Array.isArray(row)) {
    const cells = row.map((cell) => String(cell ?? "").replace(/<[^>]+>/g, "").trim());
    const pesel = cells.find((cell) => /^\d{11}$/.test(cell)) || "";
    if (!pesel) return null;

    const peselIndex = cells.indexOf(pesel);
    const namePart = cells[peselIndex - 1] || cells[0] || "";
    const email = cells[peselIndex + 1] || "";
    const memberSince = cells[peselIndex + 2] || "";
    const memberUntil = cells[peselIndex + 3] || "";

    return { namePart, pesel, email, memberSince, memberUntil };
  }

  if (typeof row === "object") {
    const pesel = String(row.pesel || row.PESEL || row.Pesel || "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(pesel)) return null;

    const lastName = row.lastName || row.LastName || row.Nazwisko || "";
    const firstName = row.firstName || row.FirstName || row.Imie || row.Imię || "";
    const namePart =
      row.displayName ||
      row.DisplayName ||
      row.fullName ||
      row.FullName ||
      `${lastName} ${firstName}`.trim();

    return {
      namePart,
      pesel,
      email: row.email || row.Email || "",
      memberSince: row.memberSince || row.MemberSince || row.dateFrom || row.DateFrom || "",
      memberUntil: row.memberUntil || row.MemberUntil || row.dateTo || row.DateTo || "",
    };
  }

  return null;
};

export const recordsToPzssText = (records = []) =>
  records
    .map((record) => {
      const parsed = parseSozPersonRecord(record);
      if (!parsed) return "";
      return [parsed.namePart, parsed.pesel, parsed.email, parsed.memberSince, parsed.memberUntil].join("\t");
    })
    .filter(Boolean)
    .join("\n");

const parseDataTablesResponse = (payload) => {
  if (!payload) return { records: [], total: 0 };

  if (Array.isArray(payload.data)) {
    return {
      records: payload.data,
      total: Number(payload.recordsTotal || payload.data.length || 0),
    };
  }

  if (Array.isArray(payload.aaData)) {
    return {
      records: payload.aaData,
      total: Number(payload.iTotalRecords || payload.aaData.length || 0),
    };
  }

  if (Array.isArray(payload)) {
    return { records: payload, total: payload.length };
  }

  return { records: [], total: 0 };
};

export class SozClient {
  constructor({ login, password, baseUrl = SOZ_BASE_URL } = {}) {
    this.login = login;
    this.password = password;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.cookies = new Map();
  }

  getCookieHeader() {
    return serializeCookies(this.cookies);
  }

  storeCookies(response) {
    const headers = response.headers.getSetCookie?.() || [];
    if (!headers.length) {
      const single = response.headers.get("set-cookie");
      if (single) headers.push(single);
    }
    for (const [key, value] of parseCookieHeader(headers)) this.cookies.set(key, value);
  }

  async request(path, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      body,
      headers: {
        "User-Agent": SOZ_USER_AGENT,
        Accept: "text/html,application/json,text/plain,*/*",
        Cookie: this.getCookieHeader(),
        ...headers,
      },
      redirect: "manual",
    });

    this.storeCookies(response);
    return response;
  }

  async loginToSoz() {
    const loginPage = await this.request("/Account/Login");
    const loginHtml = await loginPage.text();

    if (/Just a moment|cf-browser-verification|challenge-platform/i.test(loginHtml)) {
      throw new Error(
        "SOZ blokuje logowanie z serwera (Cloudflare). Użyj skryptu synchronizacji na stronie https://soz.pzss.org.pl/Club/Persons/List.",
      );
    }

    const token = extractVerificationToken(loginHtml);
    const params = new URLSearchParams();
    if (token) params.set("__RequestVerificationToken", token);
    params.set("UserName", this.login);
    params.set("Password", this.password);

    const loginResponse = await this.request("/Account/Login", {
      method: "POST",
      body: params,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: this.baseUrl,
        Referer: `${this.baseUrl}/Account/Login`,
      },
    });

    if (loginResponse.status >= 400) {
      throw new Error(`Logowanie do SOZ nie powiodło się (${loginResponse.status}).`);
    }
  }

  async fetchPersonsPage(start = 0, length = 500) {
    const endpoints = [
      { path: "/Club/Persons/List", method: "POST" },
      { path: "/Club/Persons/ListData", method: "POST" },
      { path: "/Club/Persons/GetList", method: "POST" },
      { path: "/Club/Persons/List", method: "GET", query: `?start=${start}&length=${length}` },
    ];

    const payload = buildDataTablesPayload(start, length);

    for (const endpoint of endpoints) {
      const url = endpoint.query ? `${endpoint.path}${endpoint.query}` : endpoint.path;
      const response = await this.request(url, {
        method: endpoint.method,
        body: endpoint.method === "POST" ? payload : undefined,
        headers:
          endpoint.method === "POST"
            ? {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                Referer: SOZ_PERSONS_LIST_URL,
              }
            : { Referer: SOZ_PERSONS_LIST_URL },
      });

      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();
      if (!raw || response.status >= 400) continue;

      if (contentType.includes("json") || raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
        try {
          const parsed = parseDataTablesResponse(JSON.parse(raw));
          if (parsed.records.length) return parsed;
        } catch {
          // try next endpoint
        }
      }

      if (raw.includes("\t") && /\d{11}/.test(raw)) {
        return { records: raw.split("\n").filter(Boolean), total: raw.split("\n").length, text: raw };
      }
    }

    return { records: [], total: 0 };
  }

  async fetchAllPersonsText() {
    const chunks = [];
    let start = 0;
    const pageSize = 500;
    let total = Infinity;

    while (start < total) {
      const page = await this.fetchPersonsPage(start, pageSize);
      if (page.text) return page.text;

      if (!page.records.length) break;

      chunks.push(...page.records);
      total = Number(page.total || chunks.length);
      start += pageSize;

      if (page.records.length < pageSize) break;
    }

    return recordsToPzssText(chunks);
  }
}

export const fetchSozPersonsText = async () => {
  const login = String(process.env.PZSS_SOZ_LOGIN || "").trim();
  const password = String(process.env.PZSS_SOZ_PASSWORD || "").trim();

  if (!login || !password) {
    throw new Error("Brak danych logowania SOZ (PZSS_SOZ_LOGIN / PZSS_SOZ_PASSWORD).");
  }

  const client = new SozClient({ login, password });
  await client.loginToSoz();
  const text = await client.fetchAllPersonsText();

  if (!text?.trim()) {
    throw new Error("SOZ nie zwróciło listy zawodników z /Club/Persons/List.");
  }

  return text;
};
