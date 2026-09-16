"""Deterministic standalone renderer. python render.py [--preview]"""
import argparse, json, math, subprocess, wave
from pathlib import Path
from functools import lru_cache
import numpy as np
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageOps, ImageFilter
from components import *

STORY=json.loads((ROOT/'story.json').read_text())
W,H,FPS,DURATION=(STORY[k] for k in ('width','height','fps','duration'))
OUT=ROOT/'output';OUT.mkdir(exist_ok=True)
FF=imageio_ffmpeg.get_ffmpeg_exe()

def run(args):
    r=subprocess.run([FF,'-v','error','-y',*map(str,args)],capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode())
    return r.stdout

@lru_cache(None)
def photo(name):
    return ImageOps.fit(Image.open(ROOT/'assets'/name).convert('RGB'),(W,H),method=Image.Resampling.LANCZOS)

def background(name,q,dark=False):
    z=1+.025*ease(q/7)
    p=photo(name).resize((round(W*z),round(H*z)),Image.Resampling.BICUBIC)
    dx=round((p.width-W)*.65);dy=round((p.height-H)*.4)
    im=p.crop((dx,dy,dx+W,dy+H)).convert('RGBA')
    if dark:
        a=np.zeros((H,W,4),dtype=np.uint8);a[:,:,:3]=(15,29,19)
        a[:,:,3]=np.interp(np.arange(W),[0,700,1300,W],[205,170,10,0]).astype(np.uint8)
        im.alpha_composite(Image.fromarray(a))
    return im

def product_base(q):
    im=Image.new('RGBA',(W,H),PAPER)
    box(im,(1120,-80,2000,1180),SAGE,250)
    brand(im)
    text(im,(95,973),'Care coordination, with you in control.',21,MUTED)
    return im

def screen_title(a,x,y,title,sub):
    text(a,(x,y),title,33,INK,True)
    text(a,(x,y+44),sub,21,MUTED)

def frame_scene(idx,t):
    s=STORY['scenes'][idx];q=t-s['start'];scene=s['id']
    if scene=='load':
        im=background('maya-morning.png',q,True);brand(im,light=True)
        reveal(im,q,.2,lambda a: text(a,(94,166),'One small change.',70,PAPER,True))
        reveal(im,q,.5,lambda a: card(a,96,272,691,'APPOINTMENT UPDATE',"Alex’s physiotherapy moved to 3:30 PM.",PAPER,105,29))
        mental_load_thoughts(im,q)
        return im
    if scene in ('handover','payoff'):
        im=background('priya-handover.png' if scene=='handover' else 'maya-payoff.png',q,True)
        brand(im,light=True)
        if scene=='handover':
            def screen(a,x,y,w):
                screen_title(a,x,y,'Alex · Today','Shared handover · Priya')
                handover(a,x,y+86,w)
            smartphone(im,screen,105,140,465,848,q)
            text(im,(637,230),'The context',54,PAPER,True)
            text(im,(637,295),'moves with',54,PAPER,True)
            text(im,(637,360),'the care.',54,PAPER,True)
        else:
            reveal(im,q,.12,lambda a:text(a,(94,348),'More room',76,PAPER,True))
            reveal(im,q,.25,lambda a:text(a,(94,438),'to be present.',76,PAPER,True))
        return im
    if scene=='brand':
        im=Image.new('RGBA',(W,H),INK);final_branding(im,q);return im
    im=product_base(q)
    if scene=='problem':
        heading(im,'THE COORDINATION LOAD',['Someone still has','to connect the dots.'],q)
        categories=['Calendar','Messages','Notes','Tasks','Contacts','Care information']
        for j,label in enumerate(categories):
            x=95+(j%2)*448;y=515+(j//2)*117
            reveal(im,q,.3+j*.12,lambda a,j=j,x=x,y=y,label=label:card(a,x,y,415,label,['Physiotherapy · 3:30 PM','Does Priya know?','Bring visit notes','Arrange transportation','Who is available?','Alex’s shared plan'][j],SAGE,98,23))
        stage=min(5,int(q/.85))
        def screen(a,x,y,w):
            screen_title(a,x,y,categories[stage],'Alex · Today')
            card(a,x,y+106,w,'Appointment update','Physiotherapy · 3:30 PM',SAGE,116,26)
            card(a,x,y+242,w,'Maya’s calendar','Meeting · 3:00 PM',AMBER,116,27)
            text(a,(x+6,y+413),'Who can connect the change',24,MUTED)
            text(a,(x+6,y+449),'to the rest of Alex’s day?',24,MUTED)
        smartphone(im,screen,q=q)
    elif scene=='meet':
        heading(im,'MEET CARESTEAD',['One shared','care picture.'],q,'The plan. The people. The next step.')
        labels=['Care Plan','Responsibilities','Schedule','Care Circle','Trusted Information','Recent Activity']
        for j,label in enumerate(labels):
            x=95+(j%2)*447;y=548+(j//2)*95
            # Loose pieces settle onto one common line and spacing.
            shift=(1-ease((q-j*.1)/1.1))*65
            reveal(im,q,j*.1,lambda a,x=x,y=y,label=label,shift=shift:box(a,(x+shift,y,x+shift+414,y+73),SAGE,16))
            reveal(im,q,j*.1,lambda a,x=x,y=y,label=label,shift=shift:text(a,(x+22+shift,y+20),label,27,INK,True))
        def screen(a,x,y,w):
            if 4.6<q<6.6:
                screen_title(a,x,y,'Care document','Photo uploaded')
                if q<5.05:
                    doc=ImageOps.contain(Image.open(ROOT/'assets/care-document.png').convert('RGBA'),(int(w),430))
                    a.alpha_composite(doc,(int(x+(w-doc.width)/2),int(y+102)))
                    text(a,(x,y+551),'Extracting useful information…',22,GREEN)
                    return
                card(a,x,y+92,w,'EXTRACTED · REVIEW REQUIRED','Follow up · Friday',AMBER,108,26)
                card(a,x,y+218,w,'Contact','Physiotherapy clinic',SAGE,97,26)
                card(a,x,y+333,w,'Visit preparation','Bring care notes',SAGE,97,26)
                box(a,(x,y+468,x+w,y+532),GREEN,15)
                text(a,(x+w/2,y+485),'Confirmed' if q>6.1 else 'Review & confirm',25,WHITE,True,'mt')
            else:
                screen_title(a,x,y,'Good morning, Maya','Alex’s shared care picture')
                for j,label in enumerate(labels):
                    box(a,(x,y+94+j*70,x+w,y+153+j*70),SAGE,13)
                    text(a,(x+19,y+108+j*70),label,24,INK,True)
                text(a,(x+3,y+540),'Add photo or document',22,GREEN)
        smartphone(im,screen,q=q)
    elif scene=='notice':
        heading(im,'NOTICE. CONNECT.',['A change means','more than a time.'],q)
        if q<3.7:
            reveal(im,q,.3,lambda a:text(a,(96,540),'“Carestead, what should I know',36,INK,True))
            reveal(im,q,.4,lambda a:text(a,(96,588),'about Alex today?”',36,INK,True))
            microphone(im,126,737,q,True)
            text(im,(179,720),'Maya asks by voice',25,MUTED)
        else:
            steps=['Physiotherapy moved to 3:30','Maya unavailable','Transportation affected','Visit preparation has no owner']
            for j,label in enumerate(steps):
                yy=506+j*81
                reveal(im,q,3.65+j*.27,lambda a,j=j,yy=yy,label=label:card(a,104,yy,846,'CONNECTED CONTEXT' if j==0 else 'ALSO AFFECTED',label,SAGE if j<2 else AMBER,74,24))
                if j:
                    reveal(im,q,3.65+j*.27,lambda a,yy=yy:line(a,[(83,yy-49),(83,yy+36),(100,yy+36)],GREEN,3))
        def screen(a,x,y,w):
            screen_title(a,x,y,'Alex · Today','Care brief · linked to evidence')
            if q<3.8:
                card(a,x,y+114,w,'VOICE BRIEF','What should I know today?',SAGE,120,25)
                microphone(a,x+w/2,y+340,q,True)
                text(a,(x+w/2,y+410),'Listening to Maya',23,MUTED,False,'mt')
            else:
                text(a,(x,y+108),'2 things need attention',29,INK,True)
                risk_cards(a,x,y+175,w,q-3.8)
                card(a,x,y+486,w,'Why this surfaced','Appointment time changed',SAGE,93,24)
        smartphone(im,screen,q=q,active=q<3.8)
    elif scene=='whatif':
        heading(im,'WHAT IF?  PLAN AHEAD.',['When your plans','change, look ahead.'],q)
        card(im,96,517,842,'MAYA’S CALENDAR','Work trip Friday',AMBER,108,32)
        reveal(im,q,.35,lambda a:text(a,(96,684),'“I won’t be available Friday.',37,INK,True))
        reveal(im,q,.45,lambda a:text(a,(96,735),'What needs coverage?”',37,INK,True))
        text(im,(96,862),'Schedule · Responsibilities · Care Circle · Availability',25,MUTED)
        def screen(a,x,y,w):
            screen_title(a,x,y,'Friday · What if?','Maya unavailable')
            if q<3.7:
                microphone(a,x+w/2,y+230,q,True)
                text(a,(x+w/2,y+319),'Checking the care picture',24,MUTED,False,'mt')
            else:
                text(a,(x,y+108),'3 responsibilities affected',27,INK,True)
                for j,(task,detail) in enumerate([('Physiotherapy transportation','3:30 PM'),('Prescription pickup','Afternoon'),('Evening check in','7:00 PM')]):
                    reveal(a,q,3.7+j*.18,lambda b,j=j,task=task,detail=detail:card(b,x,y+169+j*108,w,detail,task,SAGE,95,23))
                reveal(a,q,5.1,lambda b:card(b,x,y+505,w,'REQUIRES A PLAN','1 coverage gap',AMBER,95,30))
        smartphone(im,screen,q=q,active=q<3.7)
    elif scene=='control':
        heading(im,'COORDINATE. REVIEW. DECIDE.',['A next step.','Your decision.'],q)
        for j,(label,value) in enumerate([('Propose','A Friday coverage plan'),('Review','Approve, edit or cancel'),('Decide','Maya stays in control')]):
            reveal(im,q,j*.25,lambda a,j=j,label=label,value=value:card(a,96,524+j*113,840,label,value,SAGE,96,30))
        def screen(a,x,y,w):
            screen_title(a,x,y,'Friday Coverage Plan','Proposal · awaiting your review' if q<6.3 else 'Approved by Maya')
            coverage_plan(a,x,y+100,w,q)
            approval_controls(a,x,y+536,w,q)
        smartphone(im,screen,q=q)
    return im

def frame(t):
    idx=max(i for i,s in enumerate(STORY['scenes']) if t>=s['start'])
    im=frame_scene(idx,t)
    # Short dissolves bridge the continuous scene progression.
    q=t-STORY['scenes'][idx]['start']
    if idx and q<.32:
        previous=frame_scene(idx-1,STORY['scenes'][idx]['start']-.001)
        im=Image.blend(previous,im,ease(q/.32))
    if t>DURATION-.35:
        im=Image.blend(im,Image.new('RGBA',(W,H),INK),.22*ease((t-DURATION+.35)/.35))
    return im.convert('RGB')

def wav(path,data,sr=48000):
    with wave.open(str(path),'wb') as f:
        f.setnchannels(data.shape[1] if data.ndim>1 else 1);f.setsampwidth(2);f.setframerate(sr)
        f.writeframes((np.clip(data,-.99,.99)*32767).astype('<i2').tobytes())

def stamp(t):
    ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'

def audio():
    sr=48000;speech=np.zeros(round(DURATION*sr));cues=[];timings=[]
    for i,seg in enumerate(STORY['narration']):
        path=ROOT/'assets'/f'voice-{i:02}.mp3'
        raw=np.frombuffer(run(['-i',path,'-ar',sr,'-ac',1,'-f','f32le','-']),'<f4').copy()
        nz=np.flatnonzero(abs(raw)>.002)
        lo=max(0,int(nz[0]) - round(.035*sr));hi=min(len(raw),int(nz[-1])+round(.07*sr));raw=raw[lo:hi]
        available=seg['end']-seg['start'];ratio=max(1,len(raw)/sr/available)
        if ratio>1.2:raise ValueError(f'Narration {i} too long ({ratio:.2f}x); shorten story.json text')
        if ratio>1:
            wav(OUT/'take.wav',raw)
            raw=np.frombuffer(run(['-i',OUT/'take.wav','-af',f'atempo={ratio}','-ar',sr,'-ac',1,'-f','f32le','-']),'<f4').copy()
        raw=raw[:round(available*sr)]
        raw*=min(.14/max(np.sqrt(np.mean(raw*raw)),1e-6),.8/max(abs(raw)))
        start=round(seg['start']*sr);speech[start:start+len(raw)]+=raw
        end=seg['start']+len(raw)/sr
        words=[json.loads(l) for l in path.with_suffix('.jsonl').read_text().splitlines() if l]
        words=[w for w in words if w['type']=='WordBoundary']
        for n in range(0,len(words),7):
            ww=words[n:n+7]
            a=seg['start']+max(0,(ww[0]['offset']/1e7-lo/sr))/ratio
            b=min(end,seg['start']+((ww[-1]['offset']+ww[-1]['duration'])/1e7-lo/sr)/ratio+.12)
            if b>a:cues.append((a,b,' '.join(w['text'] for w in ww)))
        timings.append(dict(start=seg['start'],end=end,speedAdjustment=round(ratio,4),text=seg['text']))
        print(f'Voice {i}: {seg["start"]:.2f}–{end:.2f}s ({ratio:.2f}x)',flush=True)
    music=np.zeros_like(speech)
    chords=[(130.81,164.81,196),(110,164.81,220),(174.61,220,261.63),(146.83,196,246.94)]
    for k in range(80):
        start=round(k*.75*sr);n=min(3*sr,len(music)-start)
        if n<=0:break
        t=np.arange(n)/sr;notes=chords[(k//8)%4];f=notes[k%3]*2
        env=np.minimum(t/.035,1)*np.exp(-t*2.3)
        music[start:start+n]+=(np.sin(2*np.pi*f*t)+.16*np.sin(2*np.pi*f*2*t))*env*.023
        if k%4==0:
            pad=sum(np.sin(2*np.pi*f*t) for f in notes)/3
            music[start:start+n]+=pad*np.minimum(t/.6,1)*np.minimum((n/sr-t)/1.2,1)*.018
    tt=np.arange(len(music))/sr;music*=np.minimum(tt/1.2,1)*np.clip((DURATION-tt)/1.8,0,1)
    # A soft cue for arrival, document confirmation and explicit approval.
    for at in [.55,19.05,45.3]:
        n=round(.2*sr);t=np.arange(n)/sr;p=round(at*sr)
        music[p:p+n]+=np.sin(2*np.pi*660*t)*np.exp(-t*24)*np.minimum(t/.01,1)*.025
    wav(OUT/'voiceover.wav',speech)
    wav(OUT/'music.wav',np.stack([music,music],axis=1))
    wav(OUT/'mix.wav',np.stack([speech+music,speech+music+.1*np.roll(music,1800)],axis=1))
    (OUT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{stamp(a)} --> {stamp(b)}\n{s}' for a,b,s in cues)+'\n')
    (OUT/'timing.json').write_text(json.dumps(timings,indent=2)+'\n')

def previews():
    times=[2.8,6,10,16,18.9,26.8,36.8,43.5,46,50.6,54.7,58.3]
    sheet=Image.new('RGB',(1440,4*292),PAPER)
    for i,t in enumerate(times):
        im=frame(t);im.save(OUT/f'frame-{t:04.1f}.jpg',quality=92)
        small=im.resize((480,270),Image.Resampling.LANCZOS)
        sheet.paste(small,((i%3)*480,(i//3)*292))
        ImageDraw.Draw(sheet).text(((i%3)*480+10,(i//3)*292+271),f'{t:.1f}s',fill=INK)
    sheet.save(OUT/'storyboard.jpg',quality=93)
    frame(58.3).save(OUT/'poster.jpg',quality=95)

def render():
    audio();previews()
    with (OUT/'encode.log').open('w') as log:
        p=subprocess.Popen([FF,'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(OUT/'mix.wav'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-t',str(DURATION),'-movflags','+faststart',str(OUT/'carestead-film.mp4')],stdin=subprocess.PIPE,stderr=log)
        try:
            for n in range(round(FPS*DURATION)):
                p.stdin.write(frame(n/FPS).tobytes())
                if n%(FPS*5)==0:print(f'Rendered {n/FPS:.0f}/{DURATION}s',flush=True)
        finally:p.stdin.close()
        if p.wait()!=0:raise RuntimeError('Encoder failed; see output/encode.log')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
    if args.preview:previews()
    else:render()
