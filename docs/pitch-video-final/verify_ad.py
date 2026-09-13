from pathlib import Path
import subprocess,json,re
import imageio_ffmpeg
R=Path(__file__).resolve().parent;ff=imageio_ffmpeg.get_ffmpeg_exe();report={}
for name,size in [('carestead-ad-v6.mp4','1920x1080'),('carestead-ad-v6.webm','1280x720')]:
 r=subprocess.run([ff,'-hide_banner','-i',str(R/name),'-f','null','-'],capture_output=True,text=True);assert r.returncode==0,r.stderr
 assert 'Audio:' in r.stderr and size in r.stderr
 m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',r.stderr);seconds=int(m[1])*3600+int(m[2])*60+float(m[3]);assert 32.95<=seconds<=40.1
 report[name]={'durationSeconds':seconds,'decodePassed':True,'hasAudio':True,'bytes':(R/name).stat().st_size}
r=subprocess.run([ff,'-hide_banner','-i',str(R/'carestead-ad-v6.mp4'),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True);stats=json.loads(r.stderr[r.stderr.rfind('{'):r.stderr.rfind('}')+1]);assert -18<float(stats['input_i'])<-14;assert float(stats['input_tp'])<=-1
report['audio']={k:stats[k] for k in ['input_i','input_tp','input_lra']}
timing=json.loads((R/'assets/timing.json').read_text());assert timing['speechSpeedChanged'] is False
for a,b in zip(timing['segments'],timing['segments'][1:]):assert a['end']<b['start']
assert timing['segments'][-1]['end']<40
report['speechSpeedChanged']=False;report['overlappingVoiceSegments']=False;report['captionTimingSource']='Speech service word boundaries'
(R/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
