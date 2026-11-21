import sys, numpy as np
from pixlib import *
name, tpl, out, pal = sys.argv[1:5]
idx = np.load(name)
ys, xs = np.nonzero(idx)
x0, x1, y0, y1 = xs.min(), xs.max()+1, ys.min(), ys.max()+1
rle, (bx, by, bw, bh) = rle_encode(idx, x0, y0, x1, y1)
s = open(tpl).read()
for k, v in {'@@PAL@@': pal, '@@X@@': bx, '@@Y@@': by, '@@W@@': bw, '@@H@@': bh, '@@RLE@@': rle}.items(): s = s.replace(k, str(v))
open(out, 'w').write(s)
print(out, len(s), 'rle chars', len(rle))
