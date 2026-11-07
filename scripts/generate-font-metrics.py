"""Regenerate shared glyph advances after font updates. Requires fonttools[woff]."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
metrics = {}
for family, package in [("IBM Plex Sans", "ibm-plex-sans"), ("Manrope", "manrope"), ("DM Sans", "dm-sans")]:
    metrics[family] = {}
    for weight in [400, 700]:
        font = TTFont(root / f"node_modules/@fontsource/{package}/files/{package}-latin-{weight}-normal.woff2")
        units = font["head"].unitsPerEm
        metrics[family][str(weight)] = {
            chr(code): round(font["hmtx"][glyph][0] / units, 4)
            for code, glyph in font.getBestCmap().items()
        }
(root / "app/font-metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
