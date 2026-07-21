#!/usr/bin/env node
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const SOZ_LOGIN_URL = "https://soz.pzss.org.pl/Account/Login?ReturnUrl=%2fClub%2fPersons%2fList";
const SOZ_LIST_URL = "https://soz.pzss.org.pl/Club/Persons/List";
const OUTPUT_PATH = process.argv[2] || "/tmp/soz-fresh.txt";

const login = process.env.PZSS_SOZ_LOGIN || "";
const password = process.env.PZSS_SOZ_PASSWORD || "";

if (!login || !password) {
  console.error("Ustaw PZSS_SOZ_LOGIN i PZSS_SOZ_PASSWORD.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForSozPage = async (page) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const title = await page.title();
    if (!/just a moment/i.test(title)) return;
    await sleep(2000);
  }
  throw new Error("Cloudflare nie zwolnił dostępu do SOZ.");
};

const collectLines = async (page) =>
  page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const rowToLine = (cells) => {
      const values = cells.map((cell) => String(cell || "").replace(/\s+/g, " ").trim());
      const pesel = values.find((cell) => /^\d{11}$/.test(cell.replace(/\D/g, ""))) || "";
      if (!pesel) return "";

      const cleanPesel = pesel.replace(/\D/g, "");
      const peselIndex = values.findIndex((cell) => cell.replace(/\D/g, "") === cleanPesel);
      const namePart = values[peselIndex - 1] || values[0] || "";
      const email = values[peselIndex + 1] || "";
      const memberSince = String(values[peselIndex + 2] || "").slice(0, 10);
      const memberUntil = String(values[peselIndex + 3] || "").slice(0, 10);

      if (!namePart || /imię i nazwisko/i.test(namePart)) return "";
      return [namePart, cleanPesel, email, memberSince, memberUntil].join("\t");
    };

    const lines = new Set();

    if (window.jQuery && jQuery.fn?.dataTable) {
      const tables = jQuery("table.dataTable, table[id]");
      for (let index = 0; index < tables.length; index += 1) {
        const table = jQuery(tables[index]);
        if (!jQuery.fn.dataTable.isDataTable(table)) continue;

        const dataTable = table.DataTable();
        const info = dataTable.page.info();
        const originalPage = info.page;
        const pageSize = info.length || 100;
        const totalPages = Math.max(1, Math.ceil(info.recordsDisplay / pageSize));

        for (let pageNo = 0; pageNo < totalPages; pageNo += 1) {
          dataTable.page(pageNo).draw("page");
          await sleep(300);
          dataTable.rows({ page: "current" }).every(function collectRow() {
            const cells = jQuery(this.node()).find("td").toArray().map((cell) => cell.innerText.trim());
            const line = rowToLine(cells);
            if (line) lines.add(line);
          });
        }

        dataTable.page(originalPage).draw("page");
      }
    }

    if (!lines.size) {
      for (const table of document.querySelectorAll("table")) {
        for (const row of table.querySelectorAll("tbody tr")) {
          const cells = [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim());
          const line = rowToLine(cells);
          if (line) lines.add(line);
        }
      }
    }

    return [...lines];
  });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: process.env.SOZ_HEADLESS === "1" ? "new" : false,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-certificate-errors",
    "--window-size=1400,900",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(SOZ_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForSozPage(page);

  await page.waitForSelector('input[name="UserName"]', { timeout: 30000 });
  await page.type('input[name="UserName"]', login, { delay: 15 });
  await page.type('input[name="Password"]', password, { delay: 15 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  if (!page.url().includes("/Club/Persons/List")) {
    await page.goto(SOZ_LIST_URL, { waitUntil: "networkidle2", timeout: 120000 });
    await waitForSozPage(page);
  }

  await sleep(4000);
  const lines = await collectLines(page);
  if (!lines.length) {
    throw new Error("Nie znaleziono zawodników na liście SOZ.");
  }

  fs.writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, memberCount: lines.length, output: OUTPUT_PATH }));
} finally {
  await browser.close();
}
