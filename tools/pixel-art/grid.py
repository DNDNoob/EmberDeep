import sys
from PIL import Image, ImageDraw
src,out,x0,y0,x1,y1,step=sys.argv[1],sys.argv[2],*map(int,sys.argv[3:8])
im=Image.open(src).convert('RGB').crop((x0,y0,x1,y1))
s=1280/(x1-x0) if (x1-x0)<1280 else 1
im=im.resize((int((x1-x0)*s),int((y1-y0)*s)))
d=ImageDraw.Draw(im)
for x in range((x0//step+1)*step,x1,step):
    X=(x-x0)*s; d.line([(X,0),(X,im.height)],fill=(255,255,255) if x%100==0 else (0,255,255),width=1); d.text((X+2,2),str(x),fill=(255,255,0))
for y in range((y0//step+1)*step,y1,step):
    Y=(y-y0)*s; d.line([(0,Y),(im.width,Y)],fill=(255,255,255) if y%100==0 else (0,255,255),width=1); d.text((2,Y+2),str(y),fill=(255,255,0))
im.save(out)
