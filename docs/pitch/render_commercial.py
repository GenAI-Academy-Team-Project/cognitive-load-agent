"""Render a 44-second Carestead commercial using licensed human footage and synthetic dialogue.
Run: python3 docs/pitch/render_commercial.py (macOS; Pillow, numpy, imageio-ffmpeg).
"""
from pathlib import Path
import json, subprocess, textwrap, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parent
ASSETS=ROOT/'assets'
FF=imageio_ffmpeg.get_ffmpeg_exe()
W,H,FPS,SECONDS,SR=1920,1080,24,44,48000
GREEN,CREAM,MINT='#193D32','#F6F4EB','#CBE8CF'
FONTS={}
LINES=[
 (.5,3.8,'Maya','Samantha','Can you take Dad to his appointment tomorrow?'),
 (4,6.9,'Alex','Daniel','Tomorrow? I thought you had it.'),
 (7.4,13.6,'Narrator','Karen','Caring for someone means keeping track of a thousand little things.'),
 (14.1,20.8,'Narrator','Karen',"Meet Carestead. One shared care plan for tasks, appointments, and who's doing what."),
 (21.1,26.6,'Narrator','Karen','It spots coordination gaps, suggests the next step, and keeps you in control.'),
 (27,30.9,'Alex','Daniel',"I've got the ride. Can you handle the pickup?"),
 (31.2,33.7,'Maya','Samantha',"Yes. It's in the plan."),
 (34.2,38.4,'Narrator','Karen','Less to carry. More care to give.'),
 (39,43.3,'Narrator','Karen','Carestead. Make room for what matters.')]
SHOTS=[(0,7,'phone-call.mp4',1),(7,14,'couple-tea.mp4',0),(14,26,'phone-call.mp4',7),(26,33,'phone-call.mp4',13),(33,39,'couple-tea.mp4',8),(39,44,'couple-tea.mp4',7)]

def run(args):
 r=subprocess.run([FF,'-hide_banner','-loglevel','error','-y',*args],capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.decode())
 return r.stdout

def wav(path,a):
 with wave.open(str(path),'wb') as f:
  f.setnchannels(2 if a.ndim==2 else 1);f.setsampwidth(2);f.setframerate(SR)
  f.writeframes((np.clip(a,-.98,.98)*32767).astype('<i2').tobytes())

def stamp(t):return f'00:{int(t)//60:02}:{int(t)%60:02}.{int(t%1*1000):03}'

def voices():
 speech=np.zeros(SR*SECONDS);meta=[];captions=[]
 for i,(start,limit,speaker,voice,line) in enumerate(LINES):
  path=ASSETS/f'voice-{i+1:02}.aiff'
  subprocess.run(['say','-v',voice,'-r','165','-o',str(path),line],check=True)
  a=np.frombuffer(run(['-i',str(path),'-ar',str(SR),'-ac','1','-f','f32le','-']),'<f4').astype(float)
  active=np.flatnonzero(np.abs(a)>.004)
  if not len(active):raise RuntimeError('Silent speech export')
  a=a[max(0,active[0]-int(.05*SR)):min(len(a),active[-1]+int(.12*SR))]
  if len(a)/SR>limit-start:
   tmp=ASSETS/'timing-input.wav';wav(tmp,a)
   a=np.frombuffer(run(['-i',str(tmp),'-af',f'atempo={(len(a)/SR)/(limit-start):.5f}','-ar',str(SR),'-ac','1','-f','f32le','-']),'<f4').astype(float)
  a*=min(.16/max(np.sqrt(np.mean(a*a)),1e-6),.82/max(np.max(np.abs(a)),1e-6))
  if speaker=='Alex':
   tmp=ASSETS/'timing-input.wav';wav(tmp,a)
   a=np.frombuffer(run(['-i',str(tmp),'-af','highpass=f=180,lowpass=f=5000','-ar',str(SR),'-ac','1','-f','f32le','-']),'<f4').astype(float)
  pos=int(start*SR);speech[pos:pos+len(a)]+=a
  end=start+len(a)/SR
  meta.append(dict(speaker=speaker,voice=voice,start=start,end=round(end,3),text=line))
  captions.append((start,end,speaker,line))
  print(f'Voice {i+1}: {speaker}, {len(a)/SR:.2f}s',flush=True)
 music=np.zeros(len(speech))
 chords=[(146.83,220,293.66),(130.81,196,261.63),(164.81,220,329.63),(146.83,220,369.99)]
 for k in range(8):
  offset=int(k*5.5*SR);n=min(int(7*SR),len(music)-offset);t=np.arange(n)/SR
  env=np.minimum(t/1.2,1)*np.minimum((n/SR-t)/2,1)
  music[offset:offset+n]+=sum(np.sin(2*np.pi*f*t) for f in chords[k%4])/3*env*.025
 t=np.arange(len(music))/SR;music*=np.minimum(t/1.5,1)*np.minimum((SECONDS-t)/1.5,1)
 wav(ROOT/'voiceover.wav',np.stack((speech,speech),axis=1))
 wav(ASSETS/'mix.wav',np.stack((speech+music,speech+np.roll(music,300)),axis=1))
 (ASSETS/'dialogue-timing.json').write_text(json.dumps(meta,indent=2))
 (ROOT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{stamp(s)} --> {stamp(e)}\n{who+": " if who!="Narrator" else ""}{line}' for s,e,who,line in captions)+'\n')
 return captions

def ft(n,serif=False):
 key=n,serif
 if key not in FONTS:FONTS[key]=ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia.ttf' if serif else '/System/Library/Fonts/Avenir Next.ttc',n)
 return FONTS[key]

def txt(d,xy,s,n=40,color=GREEN,serif=False,anchor=None):d.text(xy,s,font=ft(n,serif),fill=color,anchor=anchor)
def ease(v):return 1-(1-min(1,max(0,v)))**3

def overlay(im,t,captions):
 im=im.convert('RGBA');layer=Image.new('RGBA',im.size);d=ImageDraw.Draw(layer)
 d.rounded_rectangle((60,43,293,107),radius=22,fill=(25,61,50,235));txt(d,(87,49),'carestead',35,CREAM)
 if 14<=t<26.8:
  p=ease((t-14)/.7);x=int(70-780*(1-p))
  d.rounded_rectangle((x,215,x+770,817),radius=30,fill=(246,244,235,248))
  txt(d,(x+40,248),'A little less to remember.',40,GREEN,True);txt(d,(x+40,311),'OUR SHARED CARE PLAN',19,'#698074')
  for j,(title,detail) in enumerate([('Dad’s appointment','Tomorrow · 9:00 AM'),('Prescription pickup','Today · 4:00 PM')]):
   y=365+j*128;d.rounded_rectangle((x+32,y,x+738,y+111),radius=18,fill='white')
   txt(d,(x+55,y+17),title,31);txt(d,(x+55,y+65),detail,23,'#698074')
  y=634;d.rounded_rectangle((x+32,y,x+738,y+145),radius=18,fill='#F1E2C7')
  txt(d,(x+55,y+17),'Ride still needs an owner.',30);txt(d,(x+55,y+66),'Suggested next step: assign a driver.',24);txt(d,(x+55,y+106),'You review the important steps.',21,'#698074')
  txt(d,(x+40,840),'Illustrative product view',18,CREAM)
 if 28.6<=t<33.8:
  p=ease((t-28.6)/.6);x=70;y=int(220+40*(1-p))
  d.rounded_rectangle((x,y,x+710,y+156),radius=25,fill=(246,244,235,int(245*p)))
  if p>.5:txt(d,(x+33,y+22),'A plan you can share.',35);txt(d,(x+33,y+83),'Ride · Alex       Pickup · Maya',28,'#426B50')
 if t>=39:
  p=ease((t-39)/.8);d.rectangle((0,0,W,H),fill=(25,61,50,int(235*p)))
  if p>.7:
   txt(d,(960,280),'Carestead',96,CREAM,True,'mm');txt(d,(960,430),'Less to carry.',94,CREAM,True,'mm');txt(d,(960,550),'More care to give.',94,MINT,True,'mm')
   txt(d,(960,713),'Make room for what matters.',37,CREAM,False,'mm');txt(d,(960,807),'Discover Carestead',31,MINT,False,'mm');txt(d,(960,1040),'Care-coordination prototype',18,MINT,False,'mm')
 current=next(((s,e,who,line) for s,e,who,line in captions if s<=t<=e+.12),None)
 if current:
  _,_,who,line=current;lines=textwrap.wrap(line,width=67);extra=26 if who!='Narrator' else 0;y=992-len(lines)*48-extra
  d.rounded_rectangle((195,y-20,1725,1017),radius=19,fill=(12,25,20,225))
  if who!='Narrator':txt(d,(230,y-8),who.upper(),20,MINT);y+=26
  for j,l in enumerate(lines):txt(d,(960,y+j*46),l,35,CREAM,False,'mt')
 if t<7:txt(d,(1855,75),'Dramatized conversation',19,'#FFFFFF',False,'ra')
 im=Image.alpha_composite(im,layer).convert('RGB')
 if t>43.5:im=Image.blend(im,Image.new('RGB',im.size,GREEN),(t-43.5)/.5)
 return im

def render(captions):
 encoder=subprocess.Popen([FF,'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(ASSETS/'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-ar',str(SR),'-t',str(SECONDS),'-movflags','+faststart',str(ROOT/'carestead-commercial.mp4')],stdin=subprocess.PIPE,stderr=(ASSETS/'encode.log').open('w'))
 previews=[]
 for start,end,asset,seek in SHOTS:
  decoder=subprocess.Popen([FF,'-hide_banner','-loglevel','error','-ss',str(seek),'-i',str(ASSETS/asset),'-t',str(end-start),'-vf',f'scale={W}:{H},fps={FPS},eq=saturation=0.94:contrast=1.025','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
  for n in range((end-start)*FPS):
   b=decoder.stdout.read(W*H*3)
   if len(b)!=W*H*3:raise RuntimeError(f'Incomplete source: {asset}')
   t=start+n/FPS;im=overlay(Image.frombytes('RGB',(W,H),b),t,captions);encoder.stdin.write(im.tobytes())
   if n==FPS*2:previews.append(im.resize((640,360)))
   if abs(t-36)<.01:im.save(ROOT/'poster.jpg',quality=94)
  decoder.stdout.close()
  if decoder.wait():raise RuntimeError('Source decoding failed')
  print(f'Edited {end}s / {SECONDS}s',flush=True)
 encoder.stdin.close()
 if encoder.wait():raise RuntimeError('Encoding failed; inspect assets/encode.log')
 sheet=Image.new('RGB',(1280,1080),GREEN)
 for i,im in enumerate(previews):sheet.paste(im,((i%2)*640,(i//2)*360))
 sheet.save(ROOT/'storyboard.jpg',quality=93)
 print('Rendering WebM with Opus speech audio',flush=True)
 run(['-i',str(ROOT/'carestead-commercial.mp4'),'-map','0:v:0','-map','0:a:0','-c:v','libvpx-vp9','-crf','32','-b:v','0','-deadline','realtime','-cpu-used','6','-c:a','libopus','-b:a','160k',str(ROOT/'carestead-commercial.webm')])
 print('Both commercial exports complete.',flush=True)

if __name__=='__main__':render(voices())
