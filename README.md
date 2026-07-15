# Sagittarius — prototyp strony klubowej

Prototyp statycznej strony **Towarzystwa Miłośników Strzelectwa „Sagittarius”** w stylu [strzelam.com](https://strzelam.com/).

## Uruchomienie lokalne

```bash
python3 -m http.server 8080
```

Otwórz: http://localhost:8080

> Formularz działa lokalnie tylko w trybie podglądu. Wysyłka do zarządu wymaga wdrożenia na Netlify.

## Wdrożenie na Netlify (konto opłacone)

### Krok 1 — Połącz GitHub z Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. **GitHub** → repozytorium **MOJA-STRONA**
3. Branch: **`main`**
4. Ustawienia buildu:
   - **Build command:** *(puste)*
   - **Publish directory:** `.`
5. **Deploy site**

### Krok 2 — Sprawdź adres strony

Po ~1 minucie Netlify poda link, np. `https://nazwa-123.netlify.app` — otwórz go w przeglądarce.

### Krok 3 — Włącz formularz (Forms)

1. **Site configuration** → **Forms** — upewnij się, że Forms są włączone
2. Po deployu powinien pojawić się formularz **`membership`**

### Krok 4 — Powiadomienia e-mail

1. **Notifications** → **Form submission notifications** → **Add notification**
2. Typ: **Email notification**
3. Form: **membership**
4. Adres: np. `kontakt@strzelamy.org.pl` lub Twój e-mail

### Krok 5 — Domena strzelamy.org.pl (opcjonalnie)

1. **Domain management** → **Add a domain** → `strzelamy.org.pl`
2. Ustaw DNS według instrukcji Netlify (zazwyczaj A record lub CNAME)
3. Poczekaj na certyfikat HTTPS (automatycznie)

### Test formularza

1. Wejdź na stronę → sekcja **Zostań członkiem**
2. Wypełnij i wyślij wniosek
3. Sprawdź **Forms → membership → Submissions** w panelu Netlify
4. Sprawdź skrzynkę e-mail

## Zawartość strony

- Sekcje: O nas, Sekcje klubowe, Oferta, Zarząd, Strzelnice, Składki
- **Formularz wniosku** (`membership`) — Netlify Forms
- Strona potwierdzenia: `/success.html`
- FAQ, kontakt, responsywny układ mobilny

## Pliki

| Plik | Opis |
|---|---|
| `index.html` | Strona główna + formularz Netlify |
| `success.html` | Potwierdzenie wysłania wniosku |
| `styles.css` | Style |
| `script.js` | Menu + wysyłka formularza |
| `success.js` | Podsumowanie na stronie sukcesu |
| `netlify.toml` | Konfiguracja Netlify |

## Pola formularza `membership`

| Pole | Opis |
|---|---|
| `application-code` | Nr wniosku (np. SG-AB12-XY34) |
| `name` | Imię i nazwisko |
| `email` | E-mail |
| `phone` | Telefon |
| `address` | Adres |
| `type` | Rodzaj członkostwa |
| `section` | Sekcja klubowa |
| `recommender` | Rekomendujący członek |
| `exempt` | Zwolnienie z zaświadczenia (tak/nie) |
| `statute` | Akceptacja statutu |
| `rodo` | Zgoda RODO |

## Kolejne kroki

1. Auto-generowanie PDF deklaracji (Netlify Function)
2. Auto-odpowiedź e-mail do kandydata
3. Upload zaświadczenia o niekaralności (Netlify Forms — pole pliku)
