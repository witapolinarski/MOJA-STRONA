# Kalendarz zawodów OZSS

Aplikacja dla **Opolskiego Związku Strzelectwa Sportowego** — kalendarz zawodów
wojewódzkich z obsadą sędziowską. To pierwszy moduł większego systemu typu
eWZSS, zbudowany świadomie wąsko: **tylko kalendarz zawodów**, bez rozliczeń,
licencji zawodniczych i sprawozdawczości (do dodania później, jeśli będzie
potrzeba).

## Co robi

- **Klub zrzeszony** loguje się kodem i hasłem (nadanym przez biuro) i zgłasza
  zawody formularzem: nazwa, dyscyplina (można zaznaczyć kilka naraz, np.
  karabin i strzelba jednocześnie), termin, miejsce, regulamin (PDF), oraz
  **obsadę wymaganą przez regulamin PZSS** — klub wybiera z rozwijanej listy
  funkcje zgodne z Regulaminem Kolegium Sędziów PZSS (sędzia główny zawodów,
  przewodniczący komisji RTS, sędzia główny strzelania, kierownik biura
  obliczeń, sędzia stanowiskowy/tarczowy itd., z opcją „Inna funkcja…” na
  wszystko, czego nie przewiduje lista), parami funkcja/osoba, od razu albo
  później, gdy już wie, kto prowadzi zawody. Klub może tu też **zaproponować
  kandydata na obserwatora WZSS/OZSS** — formularz pokazuje wtedy adnotację
  o wymaganej min. II klasie sędziowskiej (w strzelaniu dynamicznym: Range
  Officer – klasa II); ostateczne przypisanie i tak należy do związku.
- **Biuro związku** widzi zgłoszenia (w tym obsadę PZSS zgłoszoną przez klub,
  tylko do odczytu), zatwierdza je albo odsyła z uwagą (z historią wersji
  regulaminu), przypisuje własną obsadę związkową (sędzia główny, delegat
  techniczny, obserwator) z rejestru sędziów, odwołuje zawody.
- Po zawodach klub albo biuro dodaje **link do wyników** — zawody przechodzą
  w status „zrealizowane”.
- **Kalendarz publiczny** (strona główna, bez logowania) pokazuje zawody
  zaakceptowane i zrealizowane, pogrupowane po roku, z filtrem po dyscyplinie
  i statusie, z linkiem do regulaminu i do wyników.
- Biuro zarządza też **rejestrem sędziów** (imię, nazwisko, klasa, ważność
  licencji) i **rejestrem klubów zrzeszonych** (nazwa, kontakt, hasło).

### Maszyna stanów zgłoszenia

```
zgłoszone ──(zatwierdź)──────────────► zaakceptowane ──(wyniki)──► zrealizowane
    │                                        │
    └──(odeślij z uwagą)──► do_poprawy       └──(odwołaj)────────► odwołane
             │                     ▲
             └─────────(popraw)────┘
```

## Architektura

- Statyczne strony (`index.html`, `klub.html`, `biuro.html`) + Netlify
  Functions (`netlify/functions/*.mjs`), bez frameworka — ten sam styl co
  reszta tego repozytorium (`/` i `/strzelam`).
- Magazyn danych: **Netlify Blobs** na produkcji. Lokalnie (testy, podgląd
  bez konta Netlify) automatycznie przełącza się na prosty magazyn plikowy w
  `ozss/.data/` — zero konfiguracji potrzebnej do sprawdzenia działania kodu.
  Zobacz `netlify/functions/lib/store.mjs`.
- Autoryzacja: tokeny HMAC podobne do istniejącego wzorca w tym repo
  (`ADMIN_PASSWORD` → tu `OZSS_BIURO_PASSWORD`). Hasła klubów trzymane jako
  PBKDF2 (sól + hash), nigdy w czystym tekście.
- Brak bazy relacyjnej — przy tej skali (jeden związek, kilkadziesiąt klubów,
  kilkaset zawodów rocznie) osobny serwer SQL byłby dodatkową rzeczą do
  utrzymania bez realnej korzyści. Jeśli w przyszłości dojdą rozliczenia,
  osobostarty czy wielodostępowe raportowanie z joinami, to naturalny moment,
  żeby przejść na Postgres (np. Neon) — struktura kodu (`lib/*.mjs`) jest
  rozdzielona tak, żeby to był wymiana jednej warstwy, nie przepisanie całości.

## Podgląd lokalny (bez konta Netlify)

```bash
cd ozss
npm install
OZSS_BIURO_PASSWORD=zmien-to node dev-server.mjs
```

Otwórz `http://localhost:8888`. Dane lądują w `ozss/.data/` (katalog
ignorowany przez git) — można go usunąć, żeby zacząć od zera.

## Testy

```bash
cd ozss
npm test
```

36 testów: logika maszyny stanów zgłoszenia, autoryzacja, rejestr klubów,
obsada wymagana przez regulamin PZSS (wpisywana i poprawiana przez klub) oraz
pełny test integracyjny przez prawdziwe handlery HTTP (logowanie biura →
utworzenie klubu → zgłoszenie zawodów z plikiem → akceptacja → obsada →
wyniki → widoczność publiczna), na magazynie lokalnym.

## Wdrożenie na Netlify

1. Nowa witryna Netlify → **Import an existing project** → to repozytorium.
2. **Base directory**: `ozss`
3. **Build command**: `npm install` · **Publish directory**: `.` ·
   **Functions directory**: `netlify/functions` (to już jest w `ozss/netlify.toml`).
4. Environment variables:
   | Zmienna | Opis |
   |---|---|
   | `OZSS_BIURO_PASSWORD` | Hasło logowania biura związku (`/biuro.html`) |
   | `OZSS_TOKEN_SECRET` | Opcjonalnie — osobny sekret do tokenów (domyślnie używa `OZSS_BIURO_PASSWORD`) |
5. **Deploy site**.

Pierwsze konta klubów tworzy biuro z panelu `/biuro.html` → zakładka „Kluby
zrzeszone” (kod logowania generowany automatycznie z nazwy klubu, hasło
nadaje biuro).

### Automatyczny deploy z GitHub Actions (opcjonalnie)

`.github/workflows/deploy-ozss.yml` wdraża `ozss/` przy każdej zmianie w tym
katalogu na `main`, analogicznie do istniejącego `deploy-strzelam.yml`.
Wymaga sekretów repozytorium: `OZSS_NETLIFY_AUTH_TOKEN`, `OZSS_NETLIFY_SITE_ID`
(Netlify → Site configuration → General → Site details oraz User settings →
Applications → Personal access tokens). Bez tych sekretów workflow kończy się
jasnym komunikatem błędu i niczego nie wdraża — Netlify może też wdrażać
bezpośrednio z gita bez tego workflow.

## Czego świadomie nie ma (na razie)

Zgodnie z zakresem tego wdrożenia: **rozliczenia i składki klubów nie są
częścią tego systemu**. Pominięte też: licencje zawodnicze i osobostarty,
kolegium sędziów z dorobkiem punktowym i wnioskami o awans, sprawozdawczość,
import z SOZ PZSS. To są sensowne następne kroki, ale każdy z nich to osobny
moduł — najlepiej dodawać je pojedynczo, gdy kalendarz już działa w praniu.

## Pliki

| Plik / folder | Opis |
|---|---|
| `index.html`, `script.js` | Publiczny kalendarz zawodów |
| `klub.html`, `klub.js` | Panel klubu zrzeszonego |
| `biuro.html`, `biuro.js` | Panel biura związku |
| `styles.css` | Wspólne style |
| `netlify/functions/` | API (logowanie, zawody, obsada PZSS, sędziowie, kluby, pliki) |
| `netlify/functions/lib/` | Logika domenowa i magazyn danych |
| `tests/` | Testy (`node --test`) |
| `dev-server.mjs` | Serwer do podglądu lokalnego bez Netlify CLI |
