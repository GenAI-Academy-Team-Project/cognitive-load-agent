"""Generate editable, individually timed voice takes. Does not read app secrets."""
import asyncio, json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent
async def main():
    story = json.loads((ROOT / 'story.json').read_text())
    for i, line in enumerate(story['narration']):
        target = ROOT / 'assets' / f'voice-{i:02}.mp3'
        if target.exists() and target.stat().st_size > 1000:
            continue
        voice = 'en-US-JennyNeural' if line.get('speaker') == 'maya' else 'en-US-AvaMultilingualNeural'
        await edge_tts.Communicate(line['text'], voice, rate='+8%', boundary='WordBoundary').save(str(target), str(target.with_suffix('.jsonl')))
        print(f'Voice {i + 1}/{len(story["narration"])}', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
