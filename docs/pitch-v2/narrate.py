"""Generate narration from public campaign copy; no care records are submitted."""
import asyncio,json
from pathlib import Path
import edge_tts
ROOT=Path(__file__).resolve().parent
async def main():
 for i,(_,_,line) in enumerate(json.loads((ROOT/'script.json').read_text())):
  path=ROOT/'assets'/f'narration-{i:02}.mp3'
  if path.exists() and path.stat().st_size>1000:continue
  await edge_tts.Communicate(line, 'en-US-JennyNeural', rate='-5%').save(str(path))
  print(f'Narration {i+1}/10',flush=True)
asyncio.run(main())
