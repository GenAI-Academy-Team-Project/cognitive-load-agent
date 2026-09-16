"""Validate the delivered media by decoding it, not just inspecting source settings."""
import json,re,subprocess
from pathlib import Path
import imageio_ffmpeg
import numpy as np

R=Path(__file__).resolve().parent
OUT=R/'output'
FF=imageio_ffmpeg.get_ffmpeg_exe()
story=json.loads((R/'story.json').read_text())
video=OUT/'carestead-film.mp4'
result=subprocess.run([FF,'-hide_banner','-i',str(video),'-map','0:v:0','-map','0:a:0','-progress','pipe:1','-f','null','-'],capture_output=True,text=True)
assert result.returncode==0,result.stderr
assert '1920x1080' in result.stderr,result.stderr
assert '24 fps' in result.stderr,result.stderr
assert 'h264' in result.stderr and 'aac' in result.stderr,result.stderr
frames=int(re.findall(r'frame=(\d+)',result.stdout)[-1])
assert frames==story['duration']*story['fps'],frames
duration=int(re.findall(r'out_time_us=(\d+)',result.stdout)[-1])/1e6
assert abs(duration-story['duration'])<.1,duration
raw=subprocess.run([FF,'-v','error','-i',str(video),'-vn','-ar','48000','-ac','2','-f','f32le','-'],capture_output=True,check=True).stdout
stereo=np.frombuffer(raw,'<f4').reshape(-1,2)
assert np.isfinite(stereo).all()
assert np.max(abs(stereo))<.99,'Clipped audio'
# Measure the delivered channels; FFmpeg's equal-power mono downmix adds gain.
audio=stereo.mean(axis=1)
timings=json.loads((OUT/'timing.json').read_text())
for i,line in enumerate(timings):
    section=audio[round(line['start']*48000):round(line['end']*48000)]
    assert np.sqrt(np.mean(section**2))>.015,f'Silent voice segment {i}'
    if i:assert timings[i-1]['end']<=line['start'],'Overlapping narration'
    assert line['end']<=story['duration']
for a,b in zip(story['scenes'],story['scenes'][1:]):assert a['end']==b['start']
assert story['scenes'][0]['start']==0 and story['scenes'][-1]['end']==story['duration']
def seconds(s):
    h,m,s=map(float,s.split(':'));return h*3600+m*60+s
cues=re.findall(r'(\d\d:\d\d:\d\d\.\d\d\d) --> (\d\d:\d\d:\d\d\.\d\d\d)',(OUT/'captions.vtt').read_text())
for a,b in cues:assert 0<=seconds(a)<seconds(b)<=story['duration']
report={'decodedSuccessfully':True,'width':1920,'height':1080,'fps':24,'frames':frames,'durationSeconds':duration,'videoCodec':'H.264','audioCodec':'AAC','audioPeak':float(np.max(abs(stereo))),'narrationSegments':len(timings),'captionCues':len(cues),'sceneTimelineContinuous':True,'humanVisuals':'AI-generated stills with camera movement; not live-action footage','ui':'Animated illustrative mobile UI based on repository branding'}
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
