"""Make an unpackable UXP developer plugin; CCX signing uses Adobe UDT later."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'plugin/manifest.json').read_text())
assert (root/'plugin/web/vendor/lcms.mjs').is_file(), 'Build the WASM engine first'
out = root/'dist'
out.mkdir(exist_ok=True)
dest = out/f'Photoshop-ICC-Gamut-Inspector-v{manifest["version"]}-developer.zip'
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root/'plugin').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(root/'plugin'))
    for name in ('README.md','LICENSE','THIRD_PARTY_NOTICES.md'):
        archive.write(root/name,name)
digest = hashlib.sha256(dest.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(f'{digest}  {dest.name}\n')
print(dest.name, digest)
