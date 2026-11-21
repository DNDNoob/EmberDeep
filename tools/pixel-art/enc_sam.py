import sys, os, numpy as np
from PIL import Image
from pixlib import *
SC=(sys.argv[1] if len(sys.argv)>1 else os.environ.get('PIXEL_SRC_DIR','.')).rstrip('/')+'/'  # folder holding uncle-sam.png
PAL = [None,'#1a120e','#3a281d','#5b3523','#8d471e','#b0601f','#d38233','#eeac57','#f3d49a','#c8683a','#e9e3d3','#9a9a96','#c0391b','#8a2a17','#254a8a','#17294f']
body = [(455,12),(500,0),(635,0),(640,60),(660,90),(690,115),(712,135),(715,160),(700,190),(700,215),(705,240),(700,270),(715,290),(740,310),(780,320),(850,360),(900,410),(918,440),(900,470),(950,520),(990,560),(1020,620),(1050,680),(1065,720),
(95,720),(110,670),(145,600),(150,540),(165,500),(200,420),(240,370),(290,320),(340,295),(400,285),(402,255),(393,235),(386,150),(386,100)]
hat=[(455,12),(500,0),(635,0),(640,60),(660,90),(690,115),(712,135),(715,170),(712,225),(690,210),(675,190),(668,160),(650,148),(600,145),(550,150),(525,147),(500,142),(470,160),(430,195),(405,226),(395,245),(393,235),(386,150),(386,100)]
face=[(525,150),(570,152),(620,146),(665,150),(672,172),(676,200),(668,230),(660,252),(640,250),(612,258),(590,285),(610,325),(640,348),(600,350),(560,335),(530,310),(505,290),(498,270),(488,250),(505,225),(515,190)]
hairL=[(402,258),(400,240),(430,205),(480,160),(520,148),(528,170),(515,200),(500,240),(512,262),(498,290),(480,310),(440,310),(420,290)]
hairR=[(668,205),(690,205),(705,215),(707,240),(700,270),(685,290),(668,285),(662,250)]
goatee=[(612,252),(640,248),(668,262),(675,300),(682,330),(678,355),(660,345),(635,320),(615,300),(605,275)]
chest=[(498,318),(578,321),(590,356),(612,362),(640,342),(660,366),(690,380),(700,430),(715,480),(725,520),(700,545),(660,530),(620,480),(590,430),(550,395),(510,350)]
handL=[(405,525),(430,505),(480,490),(530,500),(550,530),(540,545),(470,550),(420,548)]
handR=[(770,560),(810,550),(845,565),(850,590),(810,600),(775,590)]
cuff=[(735,545),(775,545),(790,600),(765,640),(740,620)]
FURP=[2,3,4,5,6,7]
REGIONS=[ # name, polygon, palette, modepasses
 ('fur',body,FURP,1),
 ('hat',hat,[8,12,13,14,15,2],1),
 ('face',face,[2,4,9,6],1),
 ('hairL',hairL,[10,11,2,8],1),
 ('hairR',hairR,[10,11,8],0),
 ('goatee',goatee,[10,11,8,6],1),
 ('chest',chest,[8,10,12,13,14,15,2],1),
 ('handL',handL,[2,4,9,6,7],1),
 ('handR',handR,[2,4,9,6],1),
 ('cuff',cuff,[8,10,6,4],0),
]
KS={'fur':5}
src = np.asarray(Image.open(SC+'uncle-sam.png').convert('RGB')).astype(np.float32)
idx = np.zeros((H,W),int)
def region(poly,pal,passes):
    m = poly_mask([poly]).astype(np.float32)
    d = box_down(np.concatenate([src*m[...,None], m[...,None]],2))
    cov = d[:,:,3]; rgb = d[:,:,:3]/np.maximum(cov[...,None],1e-3)
    valid = cov>0.5
    q = quantise(rgb, np.array([hex2rgb(PAL[i]) for i in pal],float))
    q = np.array(pal)[q]; q=np.where(valid,q,0)
    if name=='fur': q = dir_mode(q, valid, (96,38), 3)
    elif passes: q = mode_filter(q, valid, KS.get(name,3), 32, passes)
    return q, valid
for name,poly,pal,ps in REGIONS:
    q,valid = region(poly,pal,ps)
    idx = np.where(valid,q,idx)
from sam_head import hat_layer, paint_head
hl = hat_layer(hat)
idx = np.where(hl>0, hl, idx)
paint_head(idx)
if os.path.exists('sam_edits.py'): exec(open('sam_edits.py').read())
v = idx>0
P=np.pad(v,1)
edge = v & ~(P[0:-2,1:-1] & P[2:,1:-1] & P[1:-1,0:-2] & P[1:-1,2:])
edge[-1,:]=False
idx[edge]=1
np.save('sam_idx.npy', idx)
preview(idx, PAL, bg=(40,120,120), scale=6).save('sam_sprite.png')
