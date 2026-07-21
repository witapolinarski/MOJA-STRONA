# Sagittarius — strona klubowa + panel administratora

Strona **Towarzystwa Miłośników Strzelectwa „Sagittarius”** z formularzem członkostwa i panelem weryfikacji dokumentów.

## Strefa klubowa

Adres: **`/strefa.html`** (lub `/strefa`)

Dostęp mają wyłącznie osoby ze **zatwierdzoną** deklaracją członkowską. Logowanie: **e-mail + PESEL** z wniosku.

W strefie członek może wygenerować i wydrukować **zaświadczenie o członkostwie** (imię i nazwisko, PESEL, data wydruku, podpis prezesa). Własny skan podpisu wgraj jako `assets/podpis-prezesa.svg` lub `.png` i zaktualizuj ścieżkę w `strefa.html`.

Osoby z uprawnieniami approvera (domyślnie Witold Apolinarski) po zalogowaniu widzą dodatkową zakładkę **Akceptacja wniosków** — ten sam mechanizm co w panelu `/admin.html`: podgląd formularza, dowodu przelewu oraz przyciski zatwierdzenia lub odrzucenia.

## Panel administratora (Witold Apolinarski)

Adres: **`/admin.html`**

**Witold Apolinarski** loguje się hasłem i zatwierdza kandydatów. Panel pokazuje:
- pełny **wynik formularza** kandydata,
- **dowód przelewu** załączony przez kandydata.

Zatwierdzenie jest możliwe dopiero po weryfikacji danych z formularza i dowodu wpłaty.

## System rekomendacji

- Pole **Rekomendujący członek klubu** w formularzu jest weryfikowane z bazą członków PZSS (nazwisko musi się zgadzać).
- Po **zatwierdzeniu** nowego członka osoba rekomendująca otrzymuje **1 punkt**.
- Baza członków i ranking punktów są dostępne wyłącznie na profilu prezesa w strefie klubowej — zakładka **Baza PZSS i rekomendacje**.
- Import pełnej listy: w SOZ skopiuj tabelę z **Zawodnicy → Lista** i wklej w zakładce importu (można importować kolejne strony — rekordy są scalane po PESEL).

## Wymagana konfiguracja Netlify

W **Site configuration → Environment variables** dodaj:

| Zmienna | Opis |
|---|---|
| `ADMIN_PASSWORD` | Hasło do panelu `/admin.html` |

Opcjonalnie:

| Zmienna | Opis |
|---|---|
| `ADMIN_TOKEN_SECRET` | Osobny sekret do tokenów (jeśli puste, używane jest `ADMIN_PASSWORD`) |
| `ADMIN_NAME` | Nazwa administratora (domyślnie: Witold Apolinarski) |
| `ADMIN_EMAIL` | E-mail administratora (domyślnie: apolinarski@yahoo.com) |
| `APPROVER_EMAILS` | E-maile członków z prawem akceptacji wniosków w strefie (domyślnie: `apolinarski@yahoo.com`) |

## Wdrożenie

1. Połącz repozytorium **MOJA-STRONA** z Netlify (branch `main`)
2. **Build command:** `npm install` *(opcjonalnie — Netlify instaluje zależności funkcji automatycznie)*
3. **Publish directory:** `.`
4. Ustaw `ADMIN_PASSWORD`
5. **Deploy site**

## Domeny

| Domena | Rola | Status |
|---|---|---|
| **strzelam.com** | Strzelnica Powszechna Kamień Śląski (oferta komercyjna) | Już na Netlify (`ubiquitous-arithmetic-c6ed77.netlify.app`) — A `75.2.60.5`, www → Netlify, HTTPS OK |
| **strzelamy.org.pl** | Klub TMS „Sagittarius” (ta witryna) | Nowa strona na Netlify (`relaxed-sawine-3b870a.netlify.app`); DNS nadal wskazuje stary hosting WordPress (microhost) |
| **strzelaj.com** | Osobna domena | Parking Afternic — nie używana przez ten projekt |

### Podłączenie `strzelamy.org.pl` (wzorzec jak przy strzelam.com)

1. W Netlify: site **relaxed-sawine-3b870a** → **Domain management** → **Add domain** → `strzelamy.org.pl`
2. Ustaw domenę jako primary (apex); Netlify doda też `www`
3. U rejestratora / DNS (microhost) ustaw:

| Typ | Nazwa | Wartość |
|---|---|---|
| **A** | `@` | `75.2.60.5` |
| **CNAME** | `www` | `relaxed-sawine-3b870a.netlify.app` |

4. Usuń stare rekordy A/AAAA wskazujące na WordPress (`188.210.221.84`)
5. Poczekaj na propagację DNS i automatyczny certyfikat HTTPS w Netlify
6. Sprawdź: `https://strzelamy.org.pl`, `/strefa`, `/rodo`, `/assets/statut-sagittarius.pdf`

**Uwaga:** `strzelam.com` zostaje na osobnej witrynie Netlify — nie podłączaj jej do tego repozytorium.

## Formularz członkostwa

Kandydat musi podać m.in. **PESEL** i formę zwracania się (Pan/Pani) — dane trafiają na zaświadczenie o członkostwie.

Kandydat musi załączyć:
- **dowód przelewu** wpisowego i składki (PDF/JPG/PNG),
- **oświadczenie o niekaralności** (akceptacja w formularzu).

Deklarację członkowską kandydat pobiera z formularza (PDF) i podpisuje we własnym zakresie.

Wniosek trafia do **Netlify Blobs** przez funkcję `submit-application`.

## Pliki

| Plik / folder | Opis |
|---|---|
| `index.html` | Strona główna + formularz |
| `strefa.html` | Strefa klubowa + zaświadczenie |
| `admin.html` | Panel administratora |
| `netlify/functions/` | API: zgłoszenia, logowanie, pliki |
| `assets/` | Zdjęcia klubu, deklaracja RODO, statut PDF |
| `robots.txt` / `sitemap.xml` | SEO pod domenę `strzelamy.org.pl` |

## Lokalnie

```bash
npm install
npx netlify dev
```

Bez `netlify dev` formularz i panel działają tylko częściowo (tryb podglądu).
