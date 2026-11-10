# KJME Margin Viewer

A web app for reviewing a KJME run. On the left is the updated text, where every change is underlined. On the right is a rail of checks. Identical edits are grouped, so one check covers every place they appear, and the checks are ordered by tier: meaning first, then word swaps, then changes made by rule. Passages that needed a human decision have their own list, with each option shown as the text it would produce.

"By rule" checks start out approved, because they follow ratified glossary rules or routine forms. You can still open and un-approve them. Checks, flags, notes and changed decisions are saved in the browser only. Use **Copy** in the rail to send them on.

## Run it

```bash
bun install
bun run dev          # http://localhost:3000, with hot reload
```

## Where the data comes from

The app only renders data; it does not build it. The harness produces the data and exports it here, one file per book:

```bash
cd ../harness
bun src/cli.ts export-viewer --dir ../pilot/philippians-001
```

This writes `public/data/PHP.json` and lists the book in `public/data/index.json`. The book switcher shows every book in that index. A book that hasn't been run yet is listed as not run.

The data contract is `buildViewerData` in [`../harness/src/viewer.ts`](../harness/src/viewer.ts), and its types are mirrored in [`src/types.ts`](src/types.ts).

## Build

```bash
bun run build                         # dist/: the app plus data/, for any static host
bun run standalone [out.html]         # one HTML file with the code, styles and every exported book inside
```

The standalone file opens from disk with no server. That is how `pilot/philippians-001/viewer.html` is made:

```bash
bun run standalone ../pilot/philippians-001/viewer.html
```

## Test

```bash
bun test             # model, review state, the text views, cards, and the app in a simulated browser
bun run check        # types and lint
```

## Links and keys

- `#php` opens a book. `#v-PHP-2-6` opens it at a verse.
- `A` approves the open check, and `F` flags it.
- `J`/`K` (or ↓/↑) move between checks.
- `]` collapses the rail.
- `Esc` closes menus.

## Layout

| Path | What |
|---|---|
| `src/App.tsx` | Loads the index, picks the book (address, then last opened), loads its data |
| `src/Viewer.tsx` | One book: wires the review, the rail, keys and menus together |
| `src/model.ts` | Groups edits into checks and orders them into tiers |
| `src/review.ts` | Review state as plain functions: marks, what opens next, keys, the Copy text |
| `src/hooks.ts` | Saved settings, review and choices, copying, scrolling, keyboard and menus |
| `src/components/Rail.tsx` | Progress, tier steps, the list of checks, the footer with Copy |
| `src/components/Doc.tsx` | The text, in four views: edited, track changes, side by side, original |
| `src/components/Cards.tsx` | Rail cards for checks and decisions |
| `src/components/Chrome.tsx` | Top bar, menus, run details, book switcher, glossary |
| `src/data.ts` | Fetches data, or reads the copy a standalone build inlines; browser storage |
| `serve.ts`, `scripts/build.ts` | Dev server and builds |
| `*.test.ts(x)`, `happydom.ts` | Tests, run in a simulated browser (happy-dom) |

Code is MIT; see [`../LICENSE.md`](../LICENSE.md).
