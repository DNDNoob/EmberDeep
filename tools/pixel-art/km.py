import sys,numpy as np
from PIL import Image,ImageDraw
im=Image.open(sys.argv[1]).convert('RGB').resize((320,180),Image.LANCZOS)
a=np.asarray(im).reshape(-1,3).astype(float)
k=int(sys.argv[2]);rng=np.random.default_rng(1)
c=a[rng.choice(len(a),k,replace=False)]
for _ in range(25):
    d=((a[:,None]-c[None])**2).sum(2);l=d.argmin(1)
    for i in range(k):
        if (l==i).any():c[i]=a[l==i].mean(0)
cnt=np.bincount(l,minlength=k)
for i in np.argsort(-cnt):print('#%02x%02x%02x'%tuple(int(x) for x in c[i]),cnt[i]*100//len(a))
