Cover assets for the Jumpfigures intro.

bloomberg-keyboard.svg  -> optional. If present, it is inlined as the cover
                           background (the keyboard). If absent, a built-in
                           lightweight vector keyboard is drawn instead.

To use your own exact keyboard art:
  1. Save your vector as:  ai-news-digest/assets/bloomberg-keyboard.svg
  2. Commit it (so the GitHub Actions build can read it).
  3. Rebuild (node src/main.js) — it gets inlined automatically.

The build stays self-contained (everything embedded into output/daily.html), so
it deploys with the existing GitHub Pages workflow with no workflow changes.
