# Playground

An interactive, in-browser Monaco code playground (edit + run Graph3D.js
snippets with no local setup), alongside a gallery of every chart type ×
theme × postfx combination, is scaffolded but not yet built.

Until then, the repository ships a local live-reload sandbox at
`examples/playground/`, wired to this repo's own source (not the published
package) via Vite:

```bash
git clone <this repository>
cd graph3d.js
npm install
npm run dev
```

Edit `examples/playground/main.js` directly — every change hot-reloads in
the browser. Every other folder under `examples/` (`08-bar-chart/`,
`09-line-chart/`, …, `22-million-points/`, `23-live-trading/`) is a complete,
runnable example of one feature; open any of them with the same `vite`
dev server (see that example's own `index.html`/`main.js`) to see it live.
