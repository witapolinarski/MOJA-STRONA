# MOJA-STRONA

A single-file, static Polish landing page (`index.html`). No build system, no dependencies, no backend, no JavaScript — just HTML + inline CSS.

## Cursor Cloud specific instructions

- This repo is a static site. There is nothing to install and no build/test/lint tooling is configured.
- Run it in dev mode by serving the repo root with any static file server, e.g. `python3 -m http.server 8000` from `/workspace`, then open `http://localhost:8000/`.
- The contact form uses `action="#"` (placeholder) and there is no backend, so submitting it will fail (e.g. Python's `http.server` returns `501 Unsupported method ('POST')`). This is expected, not a bug.
- `index.html` contains some stray leading/trailing text (a pasted chat transcript) around the actual HTML document; browsers still render the page correctly. Do not treat this as an error unless asked to clean it up.
