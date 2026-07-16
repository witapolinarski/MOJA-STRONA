# Sagittarius — strona klubowa + panel administratora

Strona **Towarzystwa Miłośników Strzelectwa „Sagittarius”** z formularzem członkostwa i panelem weryfikacji dokumentów.

## Strefa klubowa

Adres: **`/strefa.html`** (lub `/strefa`)

Dostęp mają wyłącznie osoby ze **zatwierdzoną** deklaracją członkowską. Logowanie: **e-mail + PESEL** z wniosku.

W strefie członek może wygenerować i wydrukować **zaświadczenie o członkostwie** (imię i nazwisko, PESEL, data wydruku, podpis prezesa). Własny skan podpisu wgraj jako `assets/podpis-prezesa.svg` lub `.png` i zaktualizuj ścieżkę w `strefa.html`.

Osoby z uprawnieniami approvera (domyślnie Witold Apolinarski) po zalogowaniu widzą dodatkową zakładkę **Akceptacja wniosków** — ten sam mechanizm co w panelu `/admin.html`: podgląd formularza, deklaracji, statusu płatności Stripe/przelewu oraz przyciski zatwierdzenia lub odrzucenia.

## Panel administratora (Witold Apolinarski)

Adres: **`/admin.html`**

**Witold Apolinarski** loguje się hasłem i zatwierdza kandydatów. Panel pokazuje:
- pełny **wynik formularza** kandydata,
- **deklarację członkowską** do pobrania,
- **potwierdzenie wpłaty** — automatycznie z Stripe po płatności online lub załączony dowód przelewu.

Zatwierdzenie jest możliwe dopiero przy komplecie: deklaracja + potwierdzona wpłata.

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
| `ADMIN_EMAIL` | E-mail administratora (domyślnie: apolinarski@op.pl) |
| `STRIPE_SECRET_KEY` | Klucz sekretny Stripe (`sk_live_...` lub `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Sekret webhooka Stripe (`whsec_...`) |
| `APPROVER_EMAILS` | E-maile członków z prawem akceptacji wniosków w strefie (domyślnie: `apolinarski@yahoo.com,apolinarski@op.pl`) |

### Stripe — płatności online

1. W [Stripe Dashboard](https://dashboard.stripe.com) utwórz webhook na adres:
   `https://TWOJA-DOMENA.netlify.app/.netlify/functions/stripe-webhook`
2. Zaznacz zdarzenie: `checkout.session.completed`
3. Skopiuj `STRIPE_WEBHOOK_SECRET` do zmiennych Netlify
4. Ustaw `STRIPE_SECRET_KEY`
5. **Trigger deploy**

Kandydat klika **Zapłać online** w formularzu — po opłacie potwierdzenie trafia do panelu Witolda.

## Wdrożenie

1. Połącz repozytorium **MOJA-STRONA** z Netlify (branch `main`)
2. **Build command:** `npm install` *(opcjonalnie — Netlify instaluje zależności funkcji automatycznie)*
3. **Publish directory:** `.`
4. Ustaw `ADMIN_PASSWORD`
5. **Deploy site**

## Formularz członkostwa

Kandydat musi podać m.in. **PESEL** i formę zwracania się (Pan/Pani) — dane trafiają na zaświadczenie o członkostwie.

Kandydat musi załączyć:
- podpisaną **deklarację członkowską** (PDF/JPG/PNG),
- **wpłatę** — online przez Stripe **lub** dowód przelewu (PDF/JPG/PNG),
- **oświadczenie o niekaralności** (akceptacja w formularzu; zwolnienie dla służb mundurowych / posiadaczy pozwolenia na broń).

Wniosek trafia do **Netlify Blobs** przez funkcję `submit-application`.

## Pliki

| Plik / folder | Opis |
|---|---|
| `index.html` | Strona główna + formularz |
| `strefa.html` | Strefa klubowa + zaświadczenie |
| `admin.html` | Panel administratora |
| `netlify/functions/` | API: zgłoszenia, logowanie, pliki |
| `assets/` | Zdjęcia klubu |

## Lokalnie

```bash
npm install
npx netlify dev
```

Bez `netlify dev` formularz i panel działają tylko częściowo (tryb podglądu).
