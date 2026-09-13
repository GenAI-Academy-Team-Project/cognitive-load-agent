"""Carestead v6: one change, a shared picture, a reviewed next step.
Uses new Emma narration, exact word-boundary captions, retimed animation, original ducked music.
"""
from pathlib import Path
import importlib.util,json,subprocess,wave,math
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parent;A=R/'assets';SR=48000;DURATION=30.;FPS=24
sp=importlib.util.spec_from_file_location('visuals',R.parent/'pitch-v3/render_ad.py');v=importlib.util.module_from_spec(sp);sp.loader.exec_module(v)
def wav(path,a):
 with wave.open(str(path),'wb') as f:f.setnchannels(2 if a.ndim==2 else 1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(a,-.99,.99)*32767).astype('<i2').tobytes())
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
def prepare():
 global DURATION
 lines=json.loads((R/'copy.json').read_text());words=[];segments=[]
 starts=[];cursor=.4;gaps=[.30,.35,.35,.35,.30,.35,0]
 for i in range(len(lines)):
  raw=np.frombuffer(v.run(['-i',A/f'ava-{i:02}.mp3','-ac',1,'-ar',SR,'-f','f32le','-']),'<f4')
  nz=np.flatnonzero(abs(raw)>.002);lo=max(0,int(nz[0])-.045*SR);hi=min(len(raw),int(nz[-1])+.09*SR)
  starts.append(cursor);cursor+=(int(hi)-int(lo))/SR+gaps[i]
 DURATION=float(max(33,math.ceil(cursor+1.4)));assert DURATION<=40,(DURATION,cursor)
 speech=np.zeros(int(DURATION*SR))
 for i,(start,label) in enumerate(zip(starts,lines)):
  x=np.frombuffer(v.run(['-i',A/f'ava-{i:02}.mp3','-ac',1,'-ar',SR,'-f','f32le','-']),'<f4').copy()
  nz=np.flatnonzero(abs(x)>.002);lo=max(0,int(nz[0])-.045*SR);hi=min(len(x),int(nz[-1])+.09*SR);lo=int(lo);hi=int(hi);x=x[lo:hi]
  x*=min(.145/max(np.sqrt(np.mean(x*x)),1e-6),.82/max(abs(x)))
  end=start+len(x)/SR;assert end<=DURATION and (i==len(lines)-1 or end<=starts[i+1]-.1)
  pos=round(start*SR);speech[pos:pos+len(x)]+=x
  meta=[json.loads(l) for l in (A/f'ava-{i:02}.jsonl').read_text().splitlines() if l.strip()]
  ww=[dict(start=start+w['offset']/1e7-lo/SR,end=start+(w['offset']+w['duration'])/1e7-lo/SR,text=w['text'],segment=i) for w in meta if w['type']=='WordBoundary']
  words.extend(ww);segments.append(dict(start=start,end=end,text=label,words=ww))
  print(f'Line {i+1}: {start:.2f}–{end:.2f}s',flush=True)
 # Caption phrases follow punctuation and actual synthesized word timing.
 cues=[]
 for seg in segments:
  ww=seg['words'];tokens=seg['text'].split();assert len(ww)==len(tokens)
  buf=[]
  for j,(w,token) in enumerate(zip(ww,tokens)):
   buf.append((w,token))
   if token.endswith(('.', '!', '?')) or j==len(ww)-1 or len(buf)>=10:
    end=buf[-1][0]['end']+.08
    if j+1<len(ww):end=min(end,ww[j+1]['start']-.01)
    cues.append((buf[0][0]['start'],end,' '.join(tok for _,tok in buf)));buf=[]
 (R/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{stamp(a)} --> {stamp(b)}\n{s}' for a,b,s in cues)+'\n')
 # Anchor the approved picture sequence to words in the new voice recording.
 def word(i,term,occurrence=0):return [w['start'] for w in segments[i]['words'] if w['text'].lower().strip('.,!?')==term.lower()][occurrence]
 anchors=[(starts[i],float(i)) for i in range(len(starts))]+[(DURATION,7.)]
 (A/'timing.json').write_text(json.dumps({'duration':DURATION,'voice':'en-US-AvaMultilingualNeural','speechSpeedChanged':False,'synthesisRate':'-3%','segments':segments,'visualAnchors':anchors},indent=2)+'\n')
 # An original warm plucked-key score with a soft pulse and restrained stereo space.
 music=np.zeros(int(DURATION*SR));rng=np.random.default_rng(491);beat=60/82
 chords=[(130.81,164.81,196.0,246.94),(174.61,220,261.63,329.63),(196,246.94,293.66,369.99),(146.83,174.61,220,261.63)]
 for k in range(math.ceil(DURATION/beat)):
  at=k*beat;off=round(at*SR);n=min(round(2.5*SR),len(music)-off);t=np.arange(n)/SR
  chord=chords[(k//4)%4];f=chord[k%4]*(2 if k%2 else 1)
  attack=np.minimum(t/.012,1);env=np.exp(-t*2.0)*attack
  note=(np.sin(2*np.pi*f*t)+.32*np.sin(2*np.pi*2*f*t)*np.exp(-t*2)+.12*np.sin(2*np.pi*3*f*t))*env
  music[off:off+n]+=note*.048
  if k%4==0:
   bass=(np.sin(2*np.pi*chord[0]/2*t)+.2*np.sin(2*np.pi*chord[0]*t))*np.exp(-t*1.7)*np.minimum(t/.035,1)
   music[off:off+n]+=bass*.028
  # Soft brushed texture, without a hard click against consonants.
  nn=min(round(.07*SR),len(music)-off);tt=np.arange(nn)/SR
  noise=rng.normal(0,1,nn);noise=np.convolve(noise,np.ones(5)/5,mode='same')
  music[off:off+nn]+=noise*np.sin(np.pi*np.arange(nn)/nn)**2*.007
 # Gentle chords under the product reveal and payoff.
 for at,notes in [(starts[2],chords[1]),(starts[4],chords[2]),(starts[5],chords[0]),(starts[5]+2,chords[0])]:
  off=round(at*SR);n=min(5*SR,len(music)-off);t=np.arange(n)/SR;env=np.minimum(t/.45,1)*np.minimum((n/SR-t)/1.2,1)
  music[off:off+n]+=sum(np.sin(2*np.pi*f*t) for f in notes)/4*env*.044
 # Lower music smoothly beneath speech; let it breathe between phrases.
 duck=np.ones_like(music)
 for seg in segments:
  a=max(0,round((seg['start']-.12)*SR));b=min(len(duck),round((seg['end']+.12)*SR));duck[a:b]=.43
 kernel=np.ones(round(.18*SR))/round(.18*SR);duck=np.convolve(duck[::240],np.ones(36)/36,mode='same');duck=np.interp(np.arange(len(music)),np.arange(len(duck))*240,duck)
 music*=duck;tt=np.arange(len(music))/SR;music*=np.minimum(tt/.35,1)*np.clip((DURATION-tt)/1.2,0,1)
 left=music+.18*np.roll(music,round(.071*SR));right=music+.18*np.roll(music,round(.109*SR))
 wav(R/'voiceover.wav',np.stack([speech,speech],axis=1));wav(R/'music.wav',np.stack([left,right],axis=1));wav(A/'mix.wav',np.stack([speech+left,speech+right],axis=1))
 return anchors,cues,segments

def card(im,x,y,w,label,value,accent=None):
 accent=accent or v.TEAL
 v.rect(im,(x+5,y+7,x+w+5,y+127),'#D6E0DD',18)
 v.rect(im,(x,y,x+w,y+120),v.WHITE,18)
 v.rect(im,(x+20,y+23,x+25,y+96),accent,2)
 v.txt(im,(x+42,y+20),label,15,v.MUTED)
 v.txt(im,(x+42,y+51),value,25 if len(value)>20 else 30,v.INK)

def base_scene(t,segs):
 k=max([i for i,s in enumerate(segs) if t>=s['start']] or [0]);q=t-segs[k]['start']
 dark=k in (1,6);im=Image.new('RGBA',(1920,1080),v.INK if dark else v.PAPER);v.brand(im,dark)
 fg=v.WHITE if dark else v.INK
 def title(label,size=65):v.ktxt(im,q,0,(65,100),label,size,fg,.45)
 def word(term):
  return next((w['start']-segs[k]['start'] for w in segs[k]['words'] if w['text'].lower().strip('.,?!')==term),0)
 if k==0:
  v.ktxt(im,q,word('care'),(65,100),'Care changes every day.',62,v.INK,.3)
  contexts=[('SUPPORTING AN OLDER PARENT','Groceries · Check-ins','older'),('NEW MOTHER & BABY','Rest · Feeding · Support','new'),('RECOVERY AFTER SURGERY','Home help · Follow-ups','recovery')]
  for j,(label,detail,term) in enumerate(contexts):
   start=max(0,word(term));p=v.out((q-start)/.24)
   if p<=0:continue
   x=70+j*405;y=315+60*(1-p)
   card(im,x,y,375,label,detail,[v.TEAL,'#726193','#A35A2C'][j])
   v.circ(im,(x+143,230,x+203,290),[v.MINT,v.LAV,v.PEACH][j])
   v.txt(im,(x+173,259),['01','02','03'][j],22,v.INK,'mm')
  if q>word('care'):
   v.ktxt(im,q,word('care'),(70,518),'Different needs. So much to coordinate.',35)
 elif k==1:
  title('One change. Three loose ends.',55)
  items=[('APPOINTMENT','11:00 · changed' if q>.7 else '9:00',80+40*v.ease(q/.7),280,v.TEAL),('RIDE','9:00 · old pickup',735,325,'#A35A2C'),('HANDOVER','Still says 9:00',365,485,'#726193')]
  for j,(a,b,x,y,c) in enumerate(items):
   dy=40*(1-v.out((q-j*.25)/.6));card(im,x,y+dy,430,a,b,c)
  for pts in [[(510,340),(630,340),(630,385),(735,385)],[(950,445),(950,545),(795,545)],[(365,545),(210,545),(210,400)]]:
   v.line(im,pts,'#718E92',2);v.moving_dot(im,pts,(q*.45)%1,v.PEACH)
 elif k==2:
  title('A shared care picture.',61)
  p=v.ease(q/1.0)
  for j,(label,val,sx,sy) in enumerate([('THE PLAN','11:00 appointment',80,280),('THE PEOPLE','Pickup unassigned',735,325),('THE NEXT STEP','Review the change',365,485)]):
   x=v.lerp(sx,70+j*405,p);y=v.lerp(sy,335,p)
   card(im,x,y,375,label,val,v.TEAL if j!=1 else '#A35A2C')
  if q>.65:
   v.line(im,[(258,480),(1068,480)],v.TEAL,3)
   for x in [258,663,1068]:v.circ(im,(x-5,475,x+5,485),v.TEAL)
   v.ktxt(im,q,.8,(70,543),'The plan. The people. The follow-through.',35)
 elif k==3:
  title('Care happens across people.',56)
  items=[('THE PLAN','A shared care picture','plan'),('THE PEOPLE','Clear responsibilities','people'),('THE FOLLOW-THROUGH','Next steps visible','follow-through')]
  for j,(label,value,term) in enumerate(items):
   p=v.out((q-word(term))/.3)
   if p>0:card(im,65+j*405,285+40*(1-p),375,label,value)
  v.ktxt(im,q,word('clear'),(70,473),'A clear next step.',40,v.INK,.3)
  v.ktxt(im,q,word('caregiver'),(690,473),'A caregiver in control.',35,v.INK,.3)
 elif k==4:
  title('A clear handover.',64)
  v.txt(im,(70,199),'FOR THE NEXT CAREGIVER',14,v.TEAL)
  rows=[('WHAT CHANGED','Physiotherapy moved to 11:00'),('WHO’S HELPING','Evening check-in · assigned'),('WHAT NEEDS ATTENTION','Ride & grocery pickup need owners')]
  for j,(label,value) in enumerate(rows):
   p=v.out((q-.12-j*.14)/.35)
   if p<=0:continue
   y=263+j*112+24*(1-p);v.rect(im,(65,y,755,y+95),v.WHITE,16)
   v.txt(im,(90,y+15),label,12,v.TEAL);v.txt(im,(90,y+40),value,24,v.INK)
  v.ktxt(im,q,word('less'),(815,280),'Less time',40,v.INK,.3)
  v.ktxt(im,q,word('chasing'),(815,332),'chasing updates.',32,v.INK,.3)
  v.ktxt(im,q,word('more'),(815,438),'More time',40,v.TEAL,.3)
  v.ktxt(im,q,word('being'),(815,490),'being there.',40,v.TEAL,.3)
 elif k==5:
  title('A little of your time.',62)
  v.ktxt(im,q,.35,(75,235),'10',160,v.TEAL,.6)
  v.ktxt(im,q,.5,(285,341),'minutes',45,v.TEAL,.5)
  v.ktxt(im,q,word('mean')-.2,(660,264),'Can mean',52)
  v.ktxt(im,q,word('much')-.2,(660,331),'so much.',66)
  v.line(im,[(80,465),(1200,465)],'#B8D6D5',2)
  v.ktxt(im,q,.5,(80,517),'Small moments of support. Being there.',32)

 else:
  v.ktxt(im,q,0,(65,122),'Carestead',83,v.WHITE,.4)
  v.ktxt(im,q,word('less'),(70,287),'Less to carry.',68,v.WHITE,.4)
  v.ktxt(im,q,word('more'),(70,377),'More care to give.',68,v.MINT,.4)
  v.line(im,[(73,520),(1200,520)],'#53777D',2)
  v.ktxt(im,q,word('give'),(75,557),'YOU CARE. WE PLAN.',24,v.PEACH,.4)
 return im

def scene(t,segs):
 problem=segs[1];intro=segs[2];end=segs[3]['start']
 if problem['start']<=t<intro['start']:
  ww=problem['words'];every=[w['start'] for w in ww if w['text'].lower()=='everyone']
  ride=next(w['start'] for w in ww if w['text'].lower()=='ride')
  # Use v3's original scene renderer directly, without baked-in captions.
  if t<every[1]:src=float(np.interp(t,[problem['start'],ride,every[0],every[1]],[0,2.023,3.276,6.5]))
  else:src=float(np.interp(t,[every[1],intro['start']],[6.5,10.99]))
  return v.scene(src)
 if intro['start']<=t<end:
  return v.scene(float(np.interp(t,[intro['start'],end],[11,14.99])))
 im=base_scene(t,segs)
 for i in range(3,len(segs)):
  st=segs[i]['start']
  if st<=t<st+.20:
   previous=v.scene(14.99) if i==3 else base_scene(st-.001,segs)
   return Image.blend(previous,im,v.ease((t-st)/.20))
 return im

def render():
 anchors,cues,segments=prepare();xs,ys=zip(*anchors)
 proc=subprocess.Popen([v.FF,'-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','-','-i',str(A/'mix.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-c:a','aac','-b:a','192k','-t',str(DURATION),'-movflags','+faststart',str(R/'carestead-ad-v6.mp4')],stdin=subprocess.PIPE,stderr=(A/'encode.log').open('w'))
 previews=[]
 for n in range(int(DURATION*24)):
  t=n/24;visual=float(np.interp(t,xs,ys));im=scene(t,segments)
  cue=next((s for a,b,s in cues if a<=t<b),None)
  if cue:
   dark=segments[1]['start']<=t<segments[2]['start'] or t>=segments[6]['start']
   width=ImageDraw.Draw(im).textlength(cue,font=v.font(21))/v.S
   v.rect(im,(640-width/2-19,669,640+width/2+19,703),v.PAPER if dark else v.INK,9)
   v.txt(im,(640,674),cue,21,v.INK if dark else v.WHITE,'mt')
  im=im.convert('RGB');proc.stdin.write(im.tobytes())
  if n%72==24 and len(previews)<12:previews.append(im.resize((640,360)))
  if t==DURATION-2:im.save(R/'poster.jpg',quality=95)
  if n%120==0:print(f'{t:.0f}/{DURATION:.0f}s',flush=True)
 proc.stdin.close();assert proc.wait()==0
 sheet=Image.new('RGB',(1920,1440),v.PAPER)
 for i,im in enumerate(previews):sheet.paste(im,(i%3*640,i//3*360))
 sheet.save(R/'storyboard.jpg',quality=94)
 v.run(['-i',R/'carestead-ad-v6.mp4','-vf','scale=1280:720','-c:v','libvpx-vp9','-crf',30,'-b:v',0,'-deadline','realtime','-cpu-used',6,'-c:a','libopus','-b:a','128k',R/'carestead-ad-v6.webm'])
 print('Exports complete.',flush=True)
if __name__=='__main__':render()
