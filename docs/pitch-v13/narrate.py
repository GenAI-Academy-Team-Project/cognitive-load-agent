"""Conversational delivery, with synthesis word timing; no playback speed changes."""
import asyncio,json
from pathlib import Path
import edge_tts
R=Path(__file__).resolve().parent
LINES=["An older parent. A new baby. Recovery after surgery. Care changes every day.","The appointment moved. The ride didn't. Everyone thought someone else had it. Everyone has part of the story.","Meet Carestead. A shared place for care.","The plan, people, and follow-through. A clear next step. A caregiver in control.","A clear handover. Less time chasing updates. More time being there.","Just ten minutes from you can mean so much to someone who needs support.","Carestead. Less to carry, more care to give."]
async def main():
 (R/'copy.json').write_text(json.dumps(LINES,indent=2)+'\n')
 for i,line in enumerate(LINES):
  p=R/'assets'/f'ava-{i:02}.mp3'
  if p.exists() and p.stat().st_size>1000:continue
  await edge_tts.Communicate(line,'en-US-AvaMultilingualNeural',rate='-3%',boundary='WordBoundary').save(str(p),str(p.with_suffix('.jsonl')))
  print(f'Voice {i+1}/{len(LINES)}',flush=True)
asyncio.run(main())
