# Sagittarius — prototyp strony klubowej

Prototyp statycznej strony **Towarzystwa Miłośników Strzelectwa „Sagittarius”** w stylu [strzelam.com](https://strzelam.com/).

## Uruchomienie lokalne

```bash
python3 -m http.server 8080
```

Otwórz: http://localhost:8080

> Formularz działa lokalnie tylko w trybie podglądu. Wysyłka do zarządu wymaga wdrożenia na Netlify.

## Wdrożenie na Netlify

### 1. Połącz repozytorium

1. Zaloguj się na [app.netlify.com](https://app.netlify.com)
2. **Add new site** → **Import an existing project**
3. Wybierz GitHub → repozytorium `MOJA-STRONA`
4. Branch: `cursor/sagittarius-club-site-2b7f` (lub `main` po merge)
5. Ustawienia buildu (wczytają się z `netlify.toml`):
   - **Build command:** *(puste)*
   - **Publish directory:** `.`
6. Kliknij **Deploy site**

### 2. Włącz powiadomienia e-mail (Forms)

Po pierwszym deployu:

1. W panelu Netlify: **Forms** → formularz `membership`
2. **Form notifications** → **Add notification** → **Email notification**
3. Podaj adres zarządu (np. `kontakt@strzelamy.org.pl`)

Każdy wniosek trafi do panelu Netlify i na skrzynkę e-mail.

### 3. Podłącz domenę strzelamy.org.pl

1. **Domain management** → **Add domain** → `strzelamy.org.pl`
2. Ustaw DNS u rejestratora domeny:
   - `A` → `75.2.60.5` (Netlify load balancer)
   - lub `CNAME` `www` → `<twoja-strona>.netlify.app`
3. Włącz **HTTPS** (Let's Encrypt — automatycznie)

### 4. Deploy z CLI (opcjonalnie)

```bash
npx netlify login
npx netlify init
npx netlify deploy --prod
```

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
