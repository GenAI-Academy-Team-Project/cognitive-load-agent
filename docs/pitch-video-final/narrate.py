"""Conversational delivery, with synthesis word timing; no playback speed changes."""
import asyncio,json
from pathlib import Path
import edge_tts
R=Path(__file__).resolve().parent
LINES=["An older parent. A new baby. Recovery after surgery. Care changes every day.","An appointment moves. The ride doesn't. Everyone has part of the story.","Carestead brings the plan and people into one shared care picture.","Review the change. Update the shared plan. See what still needs attention, with you in control.","Just ten minutes from you can mean so much to someone who needs support.","Carestead. Less to carry, more care to give."]
async def main():
 (R/'copy.json').write_text(json.dumps(LINES,indent=2)+'\n')
 for i,line in enumerate(LINES):
  p=R/'assets'/f'ava-{i:02}.mp3'
  if i not in (1,3) and p.exists() and p.stat().st_size>1000:continue
  await edge_tts.Communicate(line,'en-US-AvaMultilingualNeural',rate='-3%',boundary='WordBoundary').save(str(p),str(p.with_suffix('.jsonl')))
  print(f'Voice {i+1}/{len(LINES)}',flush=True)
asyncio.run(main())
