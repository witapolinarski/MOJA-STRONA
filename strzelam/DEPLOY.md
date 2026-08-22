# Wdrożenie strzelam.com

## Ustawienia Netlify (strzelam-strona) — OBOWIĄZKOWE

W **Site configuration → Build & deploy → Build settings**:

| Pole | Wartość |
|------|---------|
| **Base directory** | *(puste — katalog główny repo)* |
| **Build command** | *(puste — bierze z `netlify.toml`)* |
| **Publish directory** | `tmp/strzelam-fix2` *(albo puste — bierze z `netlify.toml`)* |

Build kopiuje `strzelam/` do `tmp/strzelam-fix2/` przed publikacją. Katalog `tmp/` nie jest w repozytorium — tworzy go komenda buildu.

Usuń ręczne nadpisania (Override) tylko jeśli kolidują z powyższymi wartościami.

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
