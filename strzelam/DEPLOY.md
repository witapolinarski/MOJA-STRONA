# Wdrożenie strzelam.com

Zmiany w kodzie trafiają na produkcję dopiero po deployu Netlify. Sam merge do `main` nie aktualizuje domeny, jeśli deploy nie przejdzie.

## Szybki deploy (panel Netlify)

1. Zaloguj się na [app.netlify.com](https://app.netlify.com).
2. Otwórz witrynę podpiętą pod **strzelam.com** (projekt `strzelam-strona`).
3. **Site configuration** → **Build & deploy** → **Continuous deployment**:
   - **Base directory**: puste (katalog główny repozytorium, nie `strzelam`)
   - **Build command**: z pliku `netlify.toml` (nie nadpisuj ręcznie)
   - **Publish directory**: `tmp/strzelam-fix2`
4. **Deploys** → **Trigger deploy** → **Deploy project** (gałąź **main**).
5. Po zakończeniu: odśwież strzelam.com (Ctrl+F5).

## Automatyczny deploy (GitHub Actions)

W repozytorium GitHub → **Settings** → **Secrets and variables** → **Actions** dodaj:

- `NETLIFY_AUTH_TOKEN` — z Netlify: User settings → Applications → Personal access tokens
- `NETLIFY_SITE_ID` — ID witryny **strzelam.com** (Site configuration → General → Site ID)

Workflow: `.github/workflows/deploy-strzelam.yml` (push na `main`).

## Weryfikacja

Po deployu na stronie głównej w sekcji intro powinno być:

- **Przyjedź postrzelać —**
- **bezpieczeństwo na pierwszym planie.**

Stary tekst z podwójnym „miejscu” oznacza, że produkcja nie została jeszcze zaktualizowana.
