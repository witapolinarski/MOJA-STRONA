#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const SITE = process.env.CLUB_SITE || "https://relaxed-sawine-3b870a.netlify.app";
const EMAIL = process.env.CLUB_EMAIL || "apolinarski@yahoo.com";
const PESEL = process.env.CLUB_PESEL || "69101500790";
const INPUT = process.argv[2] || "/tmp/soz-fresh.txt";

const requestJson = async (path, { method = "GET", body, token } = {}) => {
  const response = await fetch(`${SITE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${method} ${path} failed (${response.status})`);
  }
  return data;
};

const login = async () => {
  const data = await requestJson("/.netlify/functions/member-login", {
    method: "POST",
    body: { email: EMAIL, pesel: PESEL },
  });
  if (!data.token) throw new Error("Brak tokenu logowania do strefy klubowej.");
  return data.token;
};

const fetchSozText = () => {
  if (!fs.existsSync(INPUT)) {
    const result = spawnSync(
      process.execPath,
      ["assets/fetch-soz-roster.mjs", INPUT],
      {
        stdio: "inherit",
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ":1" },
      },
    );
    if (result.status !== 0) {
      throw new Error("Nie udało się pobrać listy z SOZ. Ustaw PZSS_SOZ_LOGIN i PZSS_SOZ_PASSWORD.");
    }
  }

  const text = fs.readFileSync(INPUT, "utf8").trim();
  if (!text.includes("\t") || !/\d{11}/.test(text)) {
    throw new Error(`Plik ${INPUT} nie wygląda na eksport SOZ.`);
  }
  return text;
};

const main = async () => {
  const token = await login();
  let imported;

  try {
    imported = await requestJson("/.netlify/functions/member-roster", {
      method: "POST",
      token,
      body: { sync: true },
    });
    console.log("sync via API:", imported);
  } catch (error) {
    console.warn("sync API:", error.message);
    const text = fetchSozText();
    imported = await requestJson("/.netlify/functions/member-roster", {
      method: "POST",
      token,
      body: { text, source: "soz-persons-list" },
    });
    console.log("import via text:", imported);
  }

  const dues = await requestJson("/.netlify/functions/member-dues?refresh=1", { token });
  const summary = dues.reconciliation?.summary || {};
  console.log(
    JSON.stringify(
      {
        rosterUpdatedAt: dues.rosterUpdatedAt,
        rosterMemberCount: dues.rosterMemberCount,
        activeMembers: summary.activeMembers,
        struckOffMembers: summary.struckOffMembers,
        withArrears: summary.withArrears,
        paidUp: summary.paidUp,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
