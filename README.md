# Sagittarius — strona klubowa + panel administratora

Strona **Towarzystwa Miłośników Strzelectwa „Sagittarius”** z formularzem członkostwa i panelem weryfikacji dokumentów.

## Strefa klubowa

Adres: **`/strefa.html`** (lub `/strefa`)

Dostęp mają wyłącznie osoby ze **zatwierdzoną** deklaracją członkowską. Logowanie: **e-mail + PESEL** z wniosku.

W strefie członek może wygenerować i wydrukować **zaświadczenie o członkostwie** (imię i nazwisko, PESEL, data wydruku, podpis prezesa). Własny skan podpisu wgraj jako `assets/podpis-prezesa.svg` lub `.png` i zaktualizuj ścieżkę w `strefa.html`.

## Panel administratora

Adres: **`/admin.html`**

Administrator loguje się hasłem i może:
- przeglądać wnioski (oczekujące / zatwierdzone / odrzucone),
- pobierać **deklarację członkowską** i **dowód wpłaty**,
- **zatwierdzać** lub **odrzucać** wniosek z uwagami.

## Wymagana konfiguracja Netlify

W **Site configuration → Environment variables** dodaj:

| Zmienna | Opis |
|---|---|
| `ADMIN_PASSWORD` | Hasło do panelu `/admin.html` |

Opcjonalnie:

| Zmienna | Opis |
|---|---|
| `ADMIN_TOKEN_SECRET` | Osobny sekret do tokenów (jeśli puste, używane jest `ADMIN_PASSWORD`) |

Po ustawieniu zmiennych wykonaj **Trigger deploy**.

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
- **dowód wpłaty** wpisowego (PDF/JPG/PNG),
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
