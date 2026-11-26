# Photoshop ICC / Gamut Inspector

A self-contained Adobe Photoshop UXP panel for inspecting ICC profiles and comparing their 3D CIELAB gamuts. This is a separate JavaScript/WebAssembly port of [Printer Profile Inspector](https://github.com/pmatra/Printer-Profile-Inspector), not a wrapper around its Python executable.

**Development preview, not an Adobe Marketplace release.** Requires Photoshop 28.0 or newer on Windows or macOS. The local WebView needs UXP 8 or newer. Photoshop host validation is tracked separately from automated browser and color-engine checks; a passing CI build does not certify Photoshop compatibility.

## Features

- Open RGB, CMYK and Gray ICC/ICM profiles; view header attributes and tag contents.
- D50 Lab sampling through LittleCMS 2.20 compiled to WebAssembly, with all four ICC rendering intents. No Python, native helper, local server, CDN or account needed at runtime.
- GPU 3D hull, wireframe and point views. Drag the plot to orbit, hold Ctrl or Command while scrolling to zoom, and use Reset view to restore the camera.
- Two-profile comparison with cyan X-ray wireframe and an explicit legend. The primary surface retains normal depth testing.
- Full sampling and hull construction in a background worker, three-result cache, bounded display point count and redraws only when the view changes. CSV exports retain all samples.
- Compact profile directory list with filename, checkboxes, search, sorting, categories and drag/drop. Hover over a profile for two seconds to see its version, color space, creation time and description.
- Real curve plots, XYZ white points, LUT channel/grid/matrix details and other tag payload information.
- Read the active Photoshop document's assigned profile name without changing the document.
- System font, shaded buttons and category headers, light/dark/system themes.
- Plugin-scoped settings and remembered directory access, with serialized writes and a last valid backup.

## Install in Photoshop

You’ll need **Photoshop 28.0 or newer** on Windows or macOS and **Adobe UXP Developer Tools**. This GitHub release is a developer package that you load from an extracted folder.

1. Open [GitHub Releases](https://github.com/pmatra/Photoshop-ICC-Gamut-Inspector/releases). Under **Assets**, download the file ending in `-developer.zip` and extract the whole archive to a folder you can keep. The extracted folder should contain `manifest.json` and a `web` folder.
2. In the **Adobe Creative Cloud** desktop app, find **UXP Developer Tools** under **All apps** and install it. Open UXP Developer Tools and click **Enable** if it prompts you to turn on Developer Mode. Approve the system prompt if shown.
3. Open Photoshop. In **Plugins** preferences, enable **Developer Mode**, then restart Photoshop if prompted. You’ll find Preferences under **Edit** on Windows or under **Photoshop** on macOS.
4. Leave Photoshop running and switch to **UXP Developer Tools**. Confirm that Photoshop appears under **Connected Apps**. Click **Add Plugin**, select the extracted `manifest.json`, then choose **Load** from the plugin’s **Actions** menu.
5. In Photoshop, choose **Plugins → ICC / Gamut Inspector**. Click **Open Profile** to inspect an `.icc` or `.icm` file, or use **Profile List → Open Directory** to browse a folder.

If Photoshop doesn’t appear in Connected Apps, confirm Developer Mode is enabled in both apps, then quit and reopen them. [Adobe’s UXP Developer Tool walkthrough](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/udt-walkthrough/)

To update, unload the existing plugin in UXP Developer Tools, then add and load the `manifest.json` from the newly extracted release. Photoshop may remember the panel’s previous size. Drag the panel tab out of the dock to float it and resize it from the edge.

## Profile directory permissions

Choose **Profile List → Open Directory** and select the folder. Leave **Make default** checked to remember it. UXP grants access to folders selected by the user; this plugin deliberately does not request unrestricted disk access.

- Windows printer profiles: `C:\Windows\System32\spool\drivers\color`
- macOS user profiles: `~/Library/ColorSync/Profiles`
- macOS shared profiles: `/Library/ColorSync/Profiles`

To organize profiles, check one or more rows, choose a category in **Move to**, and click **Move selected**. You can also select profiles before clicking **Create category** to put them directly into the new category.

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
