# me/

A personal site: who I am, what I build, what I am into, and a resume. Its
own thing, like `dnd/` and `coach/`: nothing in `rooms/`, `shared/`,
`engines/` or `data/` changes for it, and nothing in SPARKS depends on it.

Live at `https://sapphirestoneage.github.io/Personalfinance/me/` once merged
to `main`.

| File | What it is |
|---|---|
| `content.js` | **Every word on the page.** Edit this and nothing else. |
| `index.html` | The page's skeleton: the sections, in order |
| `site.css` | The look; its own tokens, none borrowed from the money rooms |
| `render.js` | Draws `content.js` into `index.html` |
| `favicon.svg` | The tab icon |

## Editing

Open `content.js`. Each section is a list of items in `{ ... }` braces.
Change the words between the quotes; delete an item to remove it; copy one
to add another. Items marked `example: true` show a small "example" tag on
the page so you can see what is still a placeholder; delete that line when
it is real.

- A photo: put `photo.jpg` in this folder and set `photo: "photo.jpg"`.
- A resume PDF: put it in this folder and set `resume.file` to its name.
- A link with an empty `url` is simply not shown.

## Rules that carry over

No real financial data. No em dashes. Relative paths only (Pages serves the
repo from a subpath).
