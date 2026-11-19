# Photoshop ICC / Gamut Inspector

A self-contained Adobe Photoshop UXP panel for inspecting ICC profiles and comparing their 3D CIELAB gamuts. This is a separate JavaScript/WebAssembly port of [Printer Profile Inspector](https://github.com/pmatra/Printer-Profile-Inspector), not a wrapper around its Python executable.

**Development preview, not an Adobe Marketplace release.** Requires Photoshop 28.0 or newer on Windows or macOS. The local WebView needs UXP 8 or newer. Photoshop host validation is tracked separately from automated browser and color-engine checks; a passing CI build does not certify Photoshop compatibility.

## Features

- Open RGB, CMYK and Gray ICC/ICM profiles; view header attributes and tag contents.
- D50 Lab sampling through LittleCMS 2.20 compiled to WebAssembly, with all four ICC rendering intents. No Python, native helper, local server, CDN or account needed at runtime.
- GPU 3D hull, wireframe and point views; orbit, zoom, high DPI rendering and reset.
- Two-profile comparison with cyan X-ray wireframe and an explicit legend. The primary surface retains normal depth testing.
- Full sampling and hull construction in a background worker, three-result cache, bounded display point count and redraws only when the view changes. CSV exports retain all samples.
- Profile directory list with filename, version, color space and creation time; search, persistent sorting, checkboxes, categories, drag/drop, rename and category removal.
- Real curve plots, XYZ white points, LUT channel/grid/matrix details and other tag payload information.
- Read the active Photoshop document's assigned profile name without changing the document.
- System font, shaded buttons and category headers, light/dark/system themes.
- Plugin-scoped settings and remembered directory access, with serialized writes and a last valid backup.

## Install for development

1. Download and unpack the developer ZIP from a successful Actions run (or build from source).
2. Install Adobe's **UXP Developer Tool** from Creative Cloud. Enable developer mode in Photoshop's Plugins preferences, then restart Photoshop if requested.
3. In UXP Developer Tool, choose **Add Plugin**, select the unpacked `manifest.json`, then **Load**.
4. Open **Plugins → ICC / Gamut Inspector**. A wider floating panel works best for profile comparisons.

The ZIP is an unpacked developer plugin, not a CCX installer. Adobe UXP Developer Tool can package a CCX; distributing through Adobe Marketplace additionally requires Adobe's plugin registration/review process. The manifest ID is a development identifier and must be replaced with an Adobe-issued plugin ID before Marketplace submission.

## Profile directory permissions

Choose **Profile List → Open Directory** and select the folder. Leave **Make default** checked to remember it. UXP grants access to folders selected by the user; this plugin deliberately does not request unrestricted disk access.

- Windows printer profiles: `C:\Windows\System32\spool\drivers\color`
- macOS user profiles: `~/Library/ColorSync/Profiles`
- macOS shared profiles: `/Library/ColorSync/Profiles`

No ICC profiles from your computer are bundled or uploaded. Categories are virtual; moving/removing a category never moves or deletes files.

## Scope and limitations

This first plugin port provides inspection, comparison and organization. Desktop profile installation, file deletion/Trash, operating-system default folder access, and desktop single-instance locks are not included: UXP has a different file-access and lifecycle model. The plugin does not assign or convert Photoshop document profiles. Reading a document profile name does not grant access to its embedded ICC bytes; open the corresponding ICC file to inspect it.

A gamut convex hull is an approximation and can include colors outside nonconvex regions of a printer gamut. It is not a soft proof or a validated numerical gamut-volume standard. Gray profiles have no 3D volume. Device-link, abstract and non-RGB/CMYK/Gray transforms are explicitly rejected for sampling, while their metadata can still be inspected. sRGB display colors are clipped by the display; Lab geometry remains independent of that clipping. Sampling is float precision, with CMYK values scaled to LittleCMS's required 0–100 range.

Settings use UXP's data folder, separate from the desktop app. UXP does not guarantee OS-level atomic replacement for every storage provider; a valid backup is retained. A plugin panel is managed by Photoshop, not by the desktop application's single-instance mechanism.

## Build

Node.js 22+, Python 3 and Docker (or Emscripten 4.0.20) are required only for building.

```sh
npm ci
docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:4.0.20 bash scripts/build-engine.sh
npm run build
npm test
python3 scripts/package.py
```

LittleCMS's exact source revision is pinned in `scripts/build-engine.sh`. The WASM binary is embedded in `plugin/web/vendor/lcms.mjs` so the runtime needs no engine download or cross-origin fetch. `src/` contains the GPU viewer and worker source; generated bundles under `plugin/web/` make the developer package directly loadable. CI rebuilds those bundles from the locked dependency tree.

## License

Project code: MIT, copyright 2026 Peter Matra. Runtime dependency notices and license texts are included in `THIRD_PARTY_NOTICES.md` and `plugin/web/vendor/`. Photoshop and UXP are Adobe products; this project is independently developed.
