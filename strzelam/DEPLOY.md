# Wdrożenie strzelam.com

## Ustawienia Netlify (strzelam-strona) — OBOWIĄZKOWE

W **Site configuration → Build & deploy → Build settings**:

| Pole | Wartość |
|------|---------|
| **Base directory** | *(puste — katalog główny repo)* |
| **Build command** | *(puste — bierze z `netlify.toml`)* |
| **Publish directory** | `strzelam` *(albo puste — bierze z `netlify.toml`)* |

**Nie ustawiaj** publish na `tmp/strzelam-fix2` — to stara konfiguracja i powoduje błąd buildu.

Usuń ręczne nadpisania (Override), jeśli są włączone — Netlify ma używać pliku `netlify.toml` z głównego katalogu repozytorium.

## Deploy ręczny

1. [app.netlify.com](https://app.netlify.com) → witryna **strzelam-strona**
2. **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
3. Gałąź: **main**
4. Po zielonym statusie: odśwież strzelam.com (Ctrl+F5)

## Weryfikacja

Po deployu w sekcji intro powinno być:

- **Przyjedź postrzelać —**
- **bezpieczeństwo na pierwszym planie.**

Stary tekst z podwójnym „miejscu” = produkcja nie została zaktualizowana.
