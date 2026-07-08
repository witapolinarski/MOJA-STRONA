# Sagittarius — prototyp strony klubowej

Prototyp statycznej strony **Towarzystwa Miłośników Strzelectwa „Sagittarius”** w stylu [strzelam.com](https://strzelam.com/).

## Uruchomienie lokalne

```bash
# Python
python3 -m http.server 8080

# lub Node
npx serve .
```

Otwórz: http://localhost:8080

## Zawartość

- Sekcje: O nas, Sekcje klubowe, Oferta, Zarząd, Strzelnice, Składki
- Formularz wniosku o członkostwo z podglądem na żywo
- FAQ, kontakt, responsywny układ mobilny

## Wdrożenie produkcyjne

1. **Netlify / Vercel** — wrzuć pliki, podłącz domenę `strzelamy.org.pl`
2. **Formularz** — podłącz Netlify Forms, Formspree lub własne API
3. **PDF** — dodaj funkcję serverless generującą deklarację z danych formularza
4. **E-mail** — powiadomienia do zarządu po każdym wniosku

## Pliki

| Plik | Opis |
|---|---|
| `index.html` | Struktura strony |
| `styles.css` | Style (inspirowane strzelam.com) |
| `script.js` | Menu mobilne + formularz członkostwa |

## Uwaga

Formularz działa w trybie prototypu — zapisuje dane w `localStorage`.
Do produkcji wymaga podpięcia backendu i generowania PDF.
