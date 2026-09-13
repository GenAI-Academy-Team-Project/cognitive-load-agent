"""Decode both delivery files and verify timing, dimensions, and audio presence."""
from pathlib import Path
import subprocess,json,re
import imageio_ffmpeg
R=Path(__file__).resolve().parent;ff=imageio_ffmpeg.get_ffmpeg_exe();report={}
for name in ['carestead-ad-v2.mp4','carestead-ad-v2.webm']:
 p=subprocess.run([ff,'-hide_banner','-i',str(R/name),'-f','null','-'],capture_output=True,text=True)
 assert p.returncode==0,p.stderr
 assert 'Audio:' in p.stderr and 'Video:' in p.stderr
 m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',p.stderr);assert m
 seconds=int(m[1])*3600+int(m[2])*60+float(m[3]);assert 39.9<=seconds<=40.1,seconds
 assert ('1920x1080' if name.endswith('mp4') else '1280x720') in p.stderr
 report[name]={'durationSeconds':seconds,'decodedSuccessfully':True,'hasAudio':True,'bytes':(R/name).stat().st_size}
p=subprocess.run([ff,'-hide_banner','-i',str(R/'carestead-ad-v2.mp4'),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True)
block=p.stderr[p.stderr.rfind('{'):p.stderr.rfind('}')+1];loudness=json.loads(block);report['audio']={k:loudness[k] for k in ['input_i','input_tp','input_lra']}
assert -18<float(loudness['input_i'])<-14
assert float(loudness['input_tp'])<=-1
voice=json.loads((R/'assets/voice-timing.json').read_text());script=json.loads((R/'script.json').read_text());assert len(voice)==len(script)
for spoken,expected in zip(voice,script):
 assert spoken[2]==expected[2]
 assert spoken[1]<=expected[1]+.05
report['scriptAligned']=True
(R/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
