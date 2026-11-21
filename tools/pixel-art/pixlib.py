"""Shared helpers for building palette-indexed sprites from the original murals."""
import numpy as np
from PIL import Image, ImageDraw

W, H = 192, 108

def hex2rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def poly_mask(polys, size=(1280, 720)):
    im = Image.new('L', size, 0); d = ImageDraw.Draw(im)
    for p in polys: d.polygon([tuple(q) for q in p], fill=255)
    return np.asarray(im) > 0

def box_down(arr, w=W, h=H):
    """area-average a float HxWxC array to (h,w)"""
    chans = []
    for c in range(arr.shape[2]):
        chans.append(np.asarray(Image.fromarray(arr[:, :, c].astype(np.float32), 'F').resize((w, h), Image.BOX)))
    return np.stack(chans, 2)

def quantise(rgb, pal_rgb, wts=(2, 4, 3)):
    d = (((rgb[:, :, None, :] - pal_rgb[None, None]) * np.array(wts)) ** 2).sum(3)
    return d.argmin(2)

def mode_filter(idx, valid, k=3, nlab=32, passes=1):
    h, w = idx.shape; r = k // 2
    for _ in range(passes):
        out = idx.copy()
        pad = np.pad(idx, r, constant_values=-1); pv = np.pad(valid, r, constant_values=False)
        for y in range(h):
            for x in range(w):
                if not valid[y, x]: continue
                win = pad[y:y+k, x:x+k]; wv = pv[y:y+k, x:x+k]
                vals = win[wv]
                cnt = np.bincount(vals, minlength=nlab)
                m = cnt.max()
                cands = np.flatnonzero(cnt == m)
                out[y, x] = idx[y, x] if idx[y, x] in cands else cands[0]
        idx = out
    return idx

def rle_encode(grid, x0, y0, x1, y1):
    """grid: HxW ints, 0=transparent. Crop bbox, emit string of (len-1,value) char pairs, base64-ish alphabet."""
    A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    flat = grid[y0:y1, x0:x1].flatten()
    s = []; i = 0
    while i < len(flat):
        v = flat[i]; j = i
        while j < len(flat) and flat[j] == v and j - i < 64: j += 1
        s.append(A[j - i - 1] + A[v]); i = j
    return ''.join(s), (x0, y0, x1 - x0, y1 - y0)

def preview(grid, pal_hex, bg=None, scale=4):
    pal = np.array([hex2rgb(h) if h else (255, 0, 255) for h in pal_hex], np.uint8)
    img = pal[grid]
    if bg is not None:
        img = np.where((grid == 0)[..., None], np.array(bg, np.uint8), img).astype(np.uint8)
    return Image.fromarray(img).resize((grid.shape[1]*scale, grid.shape[0]*scale), Image.NEAREST)

def dir_mode(idx, valid, center, n=3, nlab=32):
    """mode along rays radiating from center (strand-like smoothing)"""
    h, w = idx.shape; out = idx.copy()
    for y in range(h):
        for x in range(w):
            if not valid[y, x]: continue
            dx, dy = x - center[0], y - center[1]
            L = (dx*dx + dy*dy) ** .5 or 1
            dx, dy = dx / L, dy / L
            cnt = np.zeros(nlab)
            for t in range(-n, n + 1):
                xx, yy = int(round(x + dx * t)), int(round(y + dy * t))
                if 0 <= xx < w and 0 <= yy < h and valid[yy, xx]:
                    cnt[idx[yy, xx]] += 2 if t == 0 else 1
            out[y, x] = cnt.argmax()
    return out
