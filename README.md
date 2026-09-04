# Aperture

Desktop-first realistic photo editor (Next.js App Router). Local canvas tools work offline; generative edits go through an operator-controlled `/api/edit` backend (mock by default).

---

## English

### Run

```bash
cd /workspace/photo-editor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production:

```bash
npm run build
npm start
```

Lint:

```bash
npm run lint
```


### Environment

Copy `.env.example` to `.env.local`:

| Variable | Default | Meaning |
|---|---|---|
| `MOCK_IMAGE_API` | `true` | Simulated edit (cinematic filter + **DEMO / MOCK API** watermark) |
| `IMAGE_API_BASE_URL` | empty | Base URL of an OpenAI-compatible or local image-edit API |
| `IMAGE_API_KEY` | empty | Optional Authorization Bearer key |
| `IMAGE_API_EDIT_PATH` | `/images/edits` | Path appended to the base URL |
| `IMAGE_API_MODEL` | `dall-e-2` | Model field for OpenAI-compatible form posts |

**Mock mode** activates when `MOCK_IMAGE_API` is not `false`, or when `IMAGE_API_BASE_URL` is unset.

**Live mode** example (OpenAI-compatible):

```env
MOCK_IMAGE_API=false
IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=sk-...
IMAGE_API_EDIT_PATH=/images/edits
```

**Self-hosted uncensored models** (plug later / via shims):

- **Stable Diffusion WebUI (A1111)** — run an OpenAI-compat proxy or point a thin adapter at `http://127.0.0.1:7860`; SD WebUI-style JSON `{ images: ["base64..."] }` is already accepted by `/api/edit`.
- **ComfyUI** — expose a small HTTP shim at e.g. `http://127.0.0.1:8188` that accepts multipart `image` + `mask` + `prompt` and returns PNG bytes or `{ images: [...] }`. Set `IMAGE_API_BASE_URL` / `IMAGE_API_EDIT_PATH` accordingly.
- Any OpenAI-compatible image edits endpoint works out of the box.

Aperture does **not** ship model weights. You operate the backend. No CSAM features. No tools whose purpose is non-consensual deepfakes.

### Features

- Upload / drag-and-drop images
- Crop, rotate +/-90 deg, flip H/V
- Exposure / contrast / saturation / temperature / tint / highlights / shadows (client canvas)
- Hold `\` or the eye toolbar button for before/after compare (live adjustments off while held)
- Brush / eraser mask overlay for inpaint
- Undo / redo, zoom, pan
- Generative panel to `POST /api/edit` with Mock/Live API badge (`GET /api/edit`)
- Export PNG / JPEG / WebP

### Project structure

```
photo-editor/
  src/app/                 # App Router pages + globals
  src/app/api/edit/        # Mock / live image-edit proxy
  src/components/          # Toolbar, canvas, panels
  src/hooks/               # Undo/redo history
  src/lib/                 # Canvas helpers + types
  .env.example
  package.json
```

### Scripts

| Script | Command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `next lint` |

---

## Polski

### Uruchomienie

```bash
cd /workspace/photo-editor
npm install
npm run dev
```

Wejdz na [http://localhost:3000](http://localhost:3000).

Produkcja:

```bash
npm run build
npm start
```


### Srodowisko

Skopiuj `.env.example` do `.env.local`.

- **`MOCK_IMAGE_API=true`** (domyslnie) — symulowana edycja z widocznym znakiem wodnym **DEMO / MOCK API** (bez kluczy API).
- **`IMAGE_API_BASE_URL` + opcjonalnie `IMAGE_API_KEY`** — przekierowanie do endpointu kompatybilnego z OpenAI Images Edits albo wlasnego proxy (ComfyUI / SD WebUI).

Aperture **nie** zawiera wag modeli. Ty kontrolujesz backend. Brak funkcji CSAM i narzedzi do deepfake'ow bez zgody.

### Funkcje MVP

- Otwieranie / przeciaganie zdjec
- Kadrowanie, obrot, odbicie
- Ekspozycja / kontrast / nasycenie / temperatura / tint / highlights / shadows
- Porownanie przed/po: przytrzymaj `\` lub ikone oka na pasku
- Maska pedzlem, cofnij/ponow, zoom
- Panel generatywny (`/api/edit`) z odznaka Mock/Live API
- Eksport PNG / JPEG / WebP

### Struktura

Jak w sekcji angielskiej powyzej — `src/app`, `src/components`, `src/lib`, `src/hooks`, `.env.example`.
