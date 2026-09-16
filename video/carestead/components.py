"""Reusable film components, in a 1920 × 1080 design space."""
from pathlib import Path
from functools import lru_cache
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
PAPER = '#fffaf2'
INK = '#284536'
GREEN = '#356447'
MUTED = '#5c695b'
SAGE = '#e7efdf'
AMBER = '#f3edcf'
ROSE = '#f8e6e7'
BORDER = '#c1ceba'
WHITE = '#ffffff'

def ease(p):
    p = max(0, min(1, p))
    return p * p * (3 - 2 * p)

@lru_cache(None)
def font(size, heading=False):
    face=ImageFont.truetype(str(ROOT / 'assets' / ('Outfit.ttf' if heading else 'DM-Sans.ttf')), size)
    face.set_variation_by_axes([530 if heading else 450])
    return face

def text(im, xy, value, size=30, color=INK, heading=False, anchor=None):
    ImageDraw.Draw(im).text(xy, value, font=font(size, heading), fill=color, anchor=anchor, spacing=9)

def box(im, xy, fill=WHITE, radius=22, outline=None, width=1):
    ImageDraw.Draw(im).rounded_rectangle(tuple(round(v) for v in xy), radius, fill, outline, width)

def line(im, points, fill=BORDER, width=2):
    ImageDraw.Draw(im).line(points, fill=fill, width=width, joint='curve')

def reveal(im, t, start, draw, duration=.5):
    p = ease((t - start) / duration)
    if p <= 0:
        return
    if p >= 1:
        draw(im)
        return
    layer = Image.new('RGBA', im.size)
    draw(layer)
    if p < 1:
        layer.putalpha(layer.getchannel('A').point(lambda a: int(a*p)))
    im.alpha_composite(layer, (0, round(22*(1-p))))

@lru_cache(None)
def logo(size):
    return Image.open(ROOT / 'assets/logo.png').convert('RGBA').resize((size, size), Image.Resampling.LANCZOS)

def brand(im, x=92, y=64, light=False, size=36):
    im.alpha_composite(logo(size+10), (int(x), int(y)))
    text(im, (x+size+24, y-2), 'Carestead', size, PAPER if light else INK, True)

def heading(im, eyebrow, rows, q, sub=None):
    reveal(im, q, .12, lambda a: text(a, (94,208), eyebrow, 21, GREEN))
    for j, row in enumerate(rows):
        reveal(im, q, .2+j*.08, lambda a, row=row, j=j: text(a, (89,250+j*88), row, 78, INK, True))
    if sub:
        reveal(im,q,.45,lambda a: text(a,(95,265+len(rows)*88),sub,29,MUTED))

def mental_load_thoughts(im, q):
    # Unboxed, irregular, drifting thoughts: deliberately unlike notifications.
    thoughts = [('Meeting at 3',155,378,.95), ('Who can drive Alex?',270,477,1.65), ('Does Priya know?',117,581,2.4), ('What else does this affect?',243,678,3.15), ('What am I forgetting?',155,790,4.05)]
    for label,x,y,start in thoughts:
        reveal(im,q,start,lambda a,label=label,x=x,y=y: text(a,(x+math.sin(q*.8+y)*5,y+math.sin(q*.7+x)*4),label,35,PAPER))

def card(im, x, y, w, label, value, tone=SAGE, h=108, value_size=27):
    box(im,(x,y,x+w,y+h),tone,18)
    text(im,(x+23,y+(8 if h<85 else 15)),label,18,MUTED)
    text(im,(x+23,y+(33 if h<85 else 45)),value,value_size,INK,True)

def risk_cards(im, x, y, w, q):
    for j,(title,detail) in enumerate([('Transportation coverage','Needs review'),('Visit preparation','No owner assigned')]):
        reveal(im,q,.2+j*.22,lambda a,j=j,title=title,detail=detail: card(a,x,y+j*122,w,detail,title,AMBER if j==0 else ROSE,108,25))
    text(im,(x+3,y+256),'View evidence',23,GREEN)
    line(im,[(x+3,y+286),(x+150,y+286)],GREEN,1)

def coverage_plan(im, x, y, w, q):
    for j,(name,task) in enumerate([('Priya','Physiotherapy transportation'),('David','Prescription pickup'),('Sarah','Evening check in')]):
        yy=y+j*112
        reveal(im,q,j*.2,lambda a,yy=yy,name=name,task=task: card(a,x,yy,w,name,task,SAGE,100,23))

def approval_controls(im, x, y, w, q):
    approved=q>=6.3
    text(im,(x,y-52),'Reviewed and approved by Maya' if approved else 'Changes wait for your review',21,MUTED)
    if approved:
        box(im,(x,y,x+w,y+61),GREEN,16)
        text(im,(x+w/2,y+14),'Coverage updated',25,WHITE,True,'mt')
        return
    bw=(w-20)/3
    for j,label in enumerate(['Approve','Edit','Cancel']):
        xx=x+j*(bw+10)
        box(im,(xx,y,xx+bw,y+61),GREEN if j==0 else PAPER,14,BORDER)
        text(im,(xx+bw/2,y+17),label,21,WHITE if j==0 else INK,False,'mt')
    if 5.6<q<6.3:
        p=ease((q-5.6)/.7)
        cx=x+bw/2;cy=y+31
        rr=12+36*p
        ImageDraw.Draw(im).ellipse((cx-rr,cy-rr,cx+rr,cy+rr),outline='#bdcdb5',width=3)

def handover(im, x, y, w):
    rows=[('What changed','Physiotherapy moved to 3:30',AMBER),('Transportation','Priya',SAGE),('Completed','Prescription pickup',SAGE),('Needs attention','Evening check in',AMBER),('Key contacts','Care Circle · 4 people',SAGE)]
    for j,(a,b,c) in enumerate(rows):
        card(im,x,y+j*102,w,a,b,c,92,23)

def microphone(im, cx, cy, q=0, active=False):
    d=ImageDraw.Draw(im)
    if active:
        rr=33+9*(.5+.5*math.sin(q*7))
        d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),outline=BORDER,width=2)
    d.ellipse((cx-28,cy-28,cx+28,cy+28),fill=GREEN)
    box(im,(cx-6,cy-15,cx+6,cy+5),WHITE,6)
    d.arc((cx-12,cy-9,cx+12,cy+12),0,180,fill=WHITE,width=2)
    line(im,[(cx,cy+12),(cx,cy+18)],WHITE,2)
    line(im,[(cx-7,cy+18),(cx+7,cy+18)],WHITE,2)

def smartphone(im, screen, x=1250, y=110, w=465, h=862, q=0, active=False):
    # One stable phone persists across the middle of the story.
    sh=Image.new('RGBA',im.size)
    box(sh,(x+10,y+20,x+w+10,y+h+20),(14,38,25,65),59)
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22)))
    box(im,(x-4,y+163,x+1,y+234),'#6a7569',3)
    box(im,(x,y,x+w,y+h),'#17251c',53,'#7a857b',3)
    box(im,(x+10,y+10,x+w-10,y+h-10),PAPER,45)
    box(im,(x+w/2-65,y+18,x+w/2+65,y+44),'#17251c',18)
    text(im,(x+33,y+22),'9:41',16,INK)
    text(im,(x+w-60,y+22),'100',14,INK)
    brand(im,x+29,y+64,False,24)
    line(im,[(x+23,y+118),(x+w-23,y+118)],BORDER)
    screen(im,x+28,y+143,w-56)
    box(im,(x+21,y+h-105,x+w-21,y+h-28),SAGE,18)
    text(im,(x+43,y+h-84),'Today',20,GREEN)
    text(im,(x+130,y+h-84),'Plan',20,MUTED)
    text(im,(x+208,y+h-84),'Circle',20,MUTED)
    microphone(im,x+w-63,y+h-66,q,active)
    box(im,(x+w/2-62,y+h-17,x+w/2+62,y+h-12),INK,3)

def final_branding(im,q):
    reveal(im,q,0,lambda a: a.alpha_composite(logo(116),(902,213)))
    reveal(im,q,.12,lambda a: text(a,(960,354),'CARESTEAD',67,PAPER,True,'mt'))
    reveal(im,q,.25,lambda a: text(a,(960,496),'Less to carry. More care to give.',65,PAPER,True,'mt'))
    reveal(im,q,.42,lambda a: text(a,(960,625),'You care. We plan.',34,'#d7e4ce',False,'mt'))
