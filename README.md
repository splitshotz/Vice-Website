# Vice Website

The landing page for [Vice](https://github.com/splitshotz/Vice), the instant replay recorder for Linux, served from `main` by GitHub Pages at https://splitshotz.github.io/Vice-Website/.

Plain HTML, CSS and a little JavaScript, with no build step. Open `index.html` directly, or serve the folder with any static file server.

- `accents.css` holds Vice's five Material 3 colour schemes, generated from `vice/data/accents.json` in the Vice repo. Regenerate it from there rather than editing it by hand.
- The Material 3 shapes (the cookie behind the F9 key, the shapes in the recording section) are drawn in `script.js` from the same formulas, which is what lets the key morph.
- Screenshots in `assets/shots` are taken from the current Vice release.
- Fonts: Figtree and Syne, both under the SIL Open Font License (`assets/fonts/OFL.txt`).
