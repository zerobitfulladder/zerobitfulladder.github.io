# Malvolio

A minimal static site generator for personal webpages.

## Installation

```bash
uv sync
```

## Usage

### Build the site

```bash
uv run malvolio build
```

Options:
- `--clean` - Clean output files before building

### Development server with live reload

```bash
uv run malvolio serve
```

Options:
- `--port PORT` - Port to serve on (default: 8000)

The server will automatically rebuild the site when you modify templates or content files.

## Project Structure

```
malvolio/
├── config.py      # Site config: static pages, list pages, titles
├── builder.py     # Core build logic
└── cli.py         # Command-line interface

templates/         # Jinja2 HTML templates
├── base.html      # Shell: head, nav, scripts
├── article.html   # Wrapper for individual content pages
├── macros.html    # Reusable content blocks (available in content files)
├── index.html
├── cv.html
├── thought.html
├── experience.html
└── music.html

content/           # Source content (edit these files)
├── thought/
│   ├── meta.yaml
│   └── *.html
└── experience/
    ├── meta.yaml
    └── *.html

docs/              # Generated output, served by GitHub Pages (don't edit)
├── index.html
├── cv.html
├── thought.html
├── experience.html
├── music.html
├── content/       # Rendered content pages
└── static/
    ├── css/
    ├── fonts/
    ├── media/
    └── vendor/    # Vendored KaTeX + highlight.js (no CDN at runtime)
```

## Adding Content

1. Create an HTML file in the appropriate content directory, e.g.
   `content/thought/my-article.html`. **Write the body only** — no `<h1>`,
   no date, no `<article>` wrapper. Those come from `meta.yaml`.

2. Add an entry to the matching `meta.yaml`:

```yaml
my-article:
  heading: "My Article Title"
  date: "15/01/2026"
  summary: "A brief description of the article"
  draft: true          # optional — builds the page, hides it from the index
```

3. Run `uv run malvolio build`, or `uv run malvolio serve` for live preview.

### Macros

Content files are rendered through Jinja, and everything in
`templates/macros.html` is available directly — no import needed:

```jinja
{{ image_pair('/static/media/a.png', '/static/media/b.png', 'Alt A', 'Alt B') }}

{{ figure('/static/media/x.png', caption='What this shows') }}

{% call side_media('/static/media/x.png', 'right') %}
    <p>Prose that flows beside the image.</p>
{% endcall %}

{% call testimonial(author='Client Name', rating=5, source='Upwork') %}
    <p>What they said.</p>
{% endcall %}
```

Item metadata is also in scope inside a content file, so `{{ heading }}`,
`{{ date }}`, and `{{ tags }}` all resolve.

## How It Works

- **Static pages** (`index`, `cv`, `music`) are declared in `config.py` and
  rendered straight from their templates.
- **List pages** (`thought`, `experience`) are built from their `meta.yaml`.
- **Individual content pages** are rendered through Jinja, wrapped in
  `article.html` (which emits the heading, summary, date, and tags from
  `meta.yaml`), then wrapped in `base.html`.
- Source files in `content/` are never modified; output goes to `docs/`.
- KaTeX and highlight.js are vendored under `docs/static/vendor/`, so the site
  has no runtime CDN dependency and works offline.
