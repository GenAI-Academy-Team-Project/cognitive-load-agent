"""Build the current deck and its v1 standalone release from the editable template."""
from pathlib import Path
import base64
import re

P = Path(__file__).parent
html = (P / "carestead-pitch.template.html").read_text()

def embed(match):
    name = match.group(1)
    if name == "voice-chat":
        asset = P.parent / "screenshots" / "voice-chat.png"
    else:
        extension = ".svg" if name == "maya-persona" or name.endswith("-v1") else ".png"
        asset = P / "assets" / (name + extension)
    mime = "image/svg+xml" if asset.suffix == ".svg" else "image/png"
    return "data:" + mime + ";base64," + base64.b64encode(asset.read_bytes()).decode()

html = re.sub(r"@@([a-z0-9-]+)@@", embed, html)
for filename in ["carestead-pitch.html", "carestead-pitch-v1.html"]:
    (P / filename).write_text(html)
print("Built current and v1 standalone HTML decks (12 slides)")
