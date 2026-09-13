"""Render the Carestead campaign from real footage, app captures and neural narration.
Run with python3 (Pillow, numpy, imageio-ffmpeg). Generate narration first.
"""
from pathlib import Path
import subprocess,json,wave,math,textwrap
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageOps
import imageio_ffmpeg
R=Path(__file__).resolve().parent; A=R/'assets'; OLD=R.parent/'pitch/assets'; DECK=R.parent/'pitch-deck/assets/current'
FF=imageio_ffmpeg.get_ffmpeg_exe();W,H,FPS,DUR,SR=1920,1080,24,40,48000
INK='#28213F';PURPLE='#59459C';LAV='#DFD3F0';PEACH='#F6DBC2';WHITE='#FFFDF8';MINT='#D9EBD9'
SCRIPT=json.loads((R/'script.json').read_text()); fonts={}
def font(n,serif=False):
 k=(n,serif)
 if k not in fonts:fonts[k]=ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia.ttf' if serif else '/System/Library/Fonts/Avenir Next.ttc',n)
 return fonts[k]
def text(d,xy,s,n=40,fill=INK,serif=False,anchor=None):d.text(xy,s,font=font(n,serif),fill=fill,anchor=anchor)
def run(args):
 p=subprocess.run([FF,'-hide_banner','-loglevel','error','-y',*map(str,args)],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode())
 return p.stdout
def wav(p,a):
 with wave.open(str(p),'wb') as f:f.setnchannels(2 if a.ndim==2 else 1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(a,-.99,.99)*32767).astype('<i2').tobytes())
def stamp(t):return f'{int(t)//3600:02}:{int(t)//60%60:02}:{int(t)%60:02}.{round(t%1*1000):03}'
def audio():
 speech=np.zeros(SR*DUR,dtype=np.float32);timing=[]
 for i,(start,end,line) in enumerate(SCRIPT):
  a=np.frombuffer(run(['-i',A/(f'deck-{i:02}.mp3' if i in [1,3,4] else f'impact-{i:02}.mp3'),'-ar',SR,'-ac',1,'-f','f32le','-']),'<f4').copy()
  active=np.flatnonzero(np.abs(a)>.003);a=a[max(0,active[0]-2400):min(len(a),active[-1]+4800)]
  ratio=len(a)/SR/(end-start)
  if ratio>1:
   wav(A/'temp-voice.wav',a);a=np.frombuffer(run(['-i',A/'temp-voice.wav','-af',f'atempo={ratio:.6f}','-ar',SR,'-ac',1,'-f','f32le','-']),'<f4').copy()
  a*=min(.14/max(np.sqrt(np.mean(a*a)),1e-6),.85/max(abs(a)))
  pos=int(start*SR);speech[pos:pos+len(a)]+=a
  timing.append([start,start+len(a)/SR,line]);print(f'Voice {i+1}: {len(a)/SR:.2f}s, fit {ratio:.2f}',flush=True)
 music=np.zeros_like(speech); chords=[(146.83,220,293.66),(130.81,196,261.63),(164.81,246.94,329.63),(146.83,220,369.99)]
 for k in range(15):
  offset=int(k*4*SR);n=min(6*SR,len(music)-offset)
  if n<=0:break
  t=np.arange(n)/SR;env=np.minimum(t/.7,1)*np.minimum((n/SR-t)/1.5,1)
  music[offset:offset+n]+=sum(np.sin(2*np.pi*f*t) for f in chords[k%4])/3*env*.023
  for j,f in enumerate(chords[k%4]):
   off=offset+int(j*.65*SR);nn=min(int(2*SR),len(music)-off)
   if nn<=0:continue
   tt=np.arange(nn)/SR;note=(np.sin(2*np.pi*f*2*tt)+.3*np.sin(2*np.pi*f*4*tt))*np.exp(-tt*3)*np.minimum(tt/.012,1)
   music[off:off+nn]+=note*.018
 t=np.arange(len(music))/SR;music*=np.minimum(t/2,1)*np.clip((DUR-t)/2,0,1)
 # Brief notification sounds make the opening checklist audible.
 for at in [.6,2.0,10.1]:
  n=int(.18*SR);tt=np.arange(n)/SR;chime=np.sin(2*np.pi*880*tt)*np.exp(-tt*28)*.024;off=int(at*SR);music[off:off+n]+=chime
 wav(R/'voiceover.wav',np.stack([speech,speech],axis=1));wav(A/'mix.wav',np.stack([speech+music,speech+np.roll(music,230)],axis=1))
 # Sentence-sized caption cues, aligned to each spoken segment.
 captions=[]
 for start,end,line in timing:
  parts=line.replace('. ','.|').split('|');total=sum(len(x) for x in parts);s=start
  for part in parts:
   e=s+(end-start)*len(part)/total;captions.append((s,e,part));s=e
 (R/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{stamp(s)} --> {stamp(e)}\n{line}' for s,e,line in captions)+'\n')
 (A/'voice-timing.json').write_text(json.dumps(timing,indent=2));return captions

def ease(x):return 1-(1-max(0,min(1,x)))**3
# Prepared backgrounds and product images avoid redundant resampling.
base=Image.new('RGB',(W,H),PEACH);d=ImageDraw.Draw(base)
for y in range(H):
 p=y/H;d.line((0,y,W,y),fill=tuple(round(a+(b-a)*p) for a,b in zip((249,226,207),(224,211,241))))
shade=Image.new('RGBA',(W,H));arr=np.zeros((H,W,4),dtype=np.uint8);arr[:,:,:3]=(23,19,37);arr[:,:,3]=np.linspace(195,0,W,dtype=np.uint8)[None,:];shade=Image.fromarray(arr)
screens={
 'tasks':Image.open(A/'responsibilities.png').convert('RGB').crop((275,675,1420,1000)),
 'risk':Image.open(A/'overview.png').convert('RGB').crop((1015,525,1420,950)),
 'approval':Image.open(DECK/'chat-approval.png').convert('RGB'),
 'handover':Image.open(DECK/'handover.png').convert('RGB').crop((550,180,2810,1470))}
def panel(im,source,box):
 x,y,w,h=box;tile=ImageOps.contain(source,(w,h));xx=x+(w-tile.width)//2;yy=y+(h-tile.height)//2
 mask=Image.new('L',tile.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,tile.width-1,tile.height-1),24,fill=255)
 dr=ImageDraw.Draw(im);dr.rounded_rectangle((xx-10,yy-10,xx+tile.width+10,yy+tile.height+10),32,fill=WHITE);im.paste(tile,(xx,yy),mask)
def brand(d,light=False):
 c=WHITE if light else INK
 text(d,(85,53),'Carestead',36,c)
def card(d,x,y,label,detail,w=610,color=WHITE):
 d.rounded_rectangle((x,y,x+w,y+135),24,fill=color);text(d,(x+28,y+17),label,25,PURPLE);text(d,(x+28,y+62),detail,34,INK)
def kinetic(im,t,start,xy,label,n,color,serif=False):
 p=ease((t-start)/.55)
 if p<=0:return
 f=font(n,serif);box=f.getbbox(label);tile=Image.new('RGBA',(box[2]+12,box[3]+16));draw=ImageDraw.Draw(tile)
 draw.text((4,0),label,font=f,fill=color);tile.putalpha(tile.getchannel('A').point(lambda a:round(a*p)))
 im.paste(tile,(round(xy[0]-4),round(xy[1]+34*(1-p))),tile)

def overlay(im,t,captions):
 im=im.convert('RGBA');human=t<11 or 15<=t<21 or 25<=t<35
 if human:
  if t<25:im=Image.alpha_composite(im,shade)
  else:
   lower=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(lower)
   for y in range(440,H):ld.line((0,y,W,y),fill=(23,19,37,round(205*(y-440)/(H-440))))
   im=Image.alpha_composite(im,lower)
 d=ImageDraw.Draw(im);brand(d,human)
 if t<6.5:
  p=ease(t/.7);x=round(85-(1-p)*180)
  text(d,(x,220),'The appointment',83,WHITE,True);text(d,(x,320),'moved.',83,WHITE,True)
  d.rounded_rectangle((85,435,85+max(1,round(375*ease((t-.5)/.8))),444),4,fill=LAV)
  if t>1.5:
   y=round(550+(1-ease((t-1.5)/.65))*80);card(d,85,y,'THE RIDE DIDN’T.','Who is updating the ride?',w=705)
 elif t<11:
  kinetic(im,t,6.5,(85,230),'Everyone has',88,WHITE,True)
  if t>7.1:
   kinetic(im,t,7.1,(85,365),'part of the story.',83,LAV,True)
 elif t<15:
  text(d,(960,260),'Carestead',115,INK,True,'mm');text(d,(960,410),'A shared care picture.',58,PURPLE,False,'mm')
  for j,label in enumerate(['The plan','Your people','The next step']):
   p=ease((t-11-j*.2)/1.0);x=100+j*590;y=int(570+(1-p)*125);x+=round((1-p)*(200 if j==2 else -200))
   d.rounded_rectangle((x,y,x+540,y+160),32,fill=WHITE);text(d,(x+270,y+77),label,42,INK,anchor='mm')
 elif t<21:
  kinetic(im,t,15.05,(85,230),'The plan. The people.',76,WHITE,True);kinetic(im,t,15.3,(85,335),'The follow-through.',76,WHITE,True)
  phases=[(15.5,'What changed?'),(17.3,'Who’s doing what?'),(19.,'What needs attention?')]
  start,label=next(((st,la) for st,la in reversed(phases) if t>=st),phases[0])
  kinetic(im,t,start,(90,560),label,48,LAV)
  for j,(st,_) in enumerate(phases):
   d.rounded_rectangle((90+j*88,685,145+j*88,691),3,fill=WHITE if t>=st else '#776A87')
 elif t<25:
  kinetic(im,t,21.05,(85,230),'A clear',92,INK,True);kinetic(im,t,21.3,(85,345),'next step.',92,PURPLE,True)
  text(d,(90,535),'A caregiver in control.',36,INK);text(d,(90,600),'You review what happens next.',32,INK)
  panel(im,screens['risk'],(round(1090+330*(1-ease((t-21)/.7))),175,675,710));d=ImageDraw.Draw(im);text(d,(1425,920),'Carestead · Sample care plan',22,PURPLE,anchor='mm')
 elif t<30.7:
  kinetic(im,t,25.1,(85,625),'Less chasing updates.',75,WHITE,True);kinetic(im,t,26.1,(85,730),'More being here.',79,WHITE,True)
 elif t<35:
  kinetic(im,t,30.7,(85,625),'Less to carry.',83,WHITE,True);kinetic(im,t,31.5,(85,730),'More care to give.',83,WHITE,True)
 else:
  text(d,(960,265),'Carestead',112,INK,True,'mm');text(d,(960,440),'You Care. We Plan.',74,PURPLE,True,'mm')
  d.rounded_rectangle((690,635,1230,738),50,fill=PURPLE);text(d,(960,683),'Explore Carestead',35,WHITE,anchor='mm')
  text(d,(960,815),'Less to carry. More care to give.',35,INK,anchor='mm')
  text(d,(960,1050),'Care-coordination prototype',19,INK,anchor='mm')
 cue=next((line for s,e,line in captions if s<=t<e),None)
 if cue:
  lines=textwrap.wrap(cue,76);height=48*len(lines)+24;y=1015-height
  d.rounded_rectangle((140,y,1780,1015),20,fill=(29,23,44,240))
  for j,line in enumerate(lines):text(d,(960,y+10+j*48),line,34,WHITE,anchor='mt')
 # A brief iris transition visually gathers the scattered pieces into the brand reveal.
 if 10.7<=t<11:
  rr=round(ease((t-10.7)/.3)*2300);d.ellipse((960-rr,540-rr,960+rr,540+rr),fill=PEACH)
 return im.convert('RGB')

def render(captions):
 shots=[(0,6,'phone-call.mp4',0),(6,11,'phone-call.mp4',7),(11,15,None,0),(15,21,'phone-call.mp4',12),(21,25,None,0),(25,30,'couple-tea.mp4',2),(30,35,'couple-tea.mp4',7),(35,40,None,0)]
 log=(A/'encode.log').open('w');enc=subprocess.Popen([FF,'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(A/'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-t',str(DUR),'-movflags','+faststart',str(R/'carestead-ad-v2.mp4')],stdin=subprocess.PIPE,stderr=log)
 previews=[]
 for start,end,clip,seek in shots:
  dec=None
  if clip:dec=subprocess.Popen([FF,'-loglevel','error','-ss',str(seek),'-i',str(OLD/clip),'-t',str(end-start),'-vf',f'scale={W}:{H},fps={FPS},eq=saturation=0.9:contrast=1.035','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
  for n in range((end-start)*FPS):
   t=start+n/FPS
   if dec:
    b=dec.stdout.read(W*H*3)
    if len(b)!=W*H*3:raise RuntimeError('Incomplete footage')
    im=Image.frombytes('RGB',(W,H),b)
   else:im=base.copy()
   frame=overlay(im,t,captions);enc.stdin.write(frame.tobytes())
   if n==FPS*2:previews.append(frame.resize((640,360)))
   if t==37:frame.save(R/'poster.jpg',quality=95)
  if dec:
   dec.stdout.close()
   if dec.wait():raise RuntimeError('Decoder failed')
  print(f'Rendered {end}/{DUR} seconds',flush=True)
 enc.stdin.close()
 if enc.wait():raise RuntimeError('Encoder failed')
 sheet=Image.new('RGB',(1280,1440),INK)
 for i,im in enumerate(previews):sheet.paste(im,((i%2)*640,(i//2)*360))
 sheet.save(R/'storyboard.jpg',quality=93)
 run(['-i',R/'carestead-ad-v2.mp4','-vf','scale=1280:720','-c:v','libvpx-vp9','-crf',33,'-b:v',0,'-deadline','realtime','-cpu-used',6,'-c:a','libopus','-b:a','128k',R/'carestead-ad-v2.webm'])
 print('MP4 and WebM complete.',flush=True)
if __name__=='__main__':render(audio())
