# one-time transformation of the classic WebGL2 script into the Three.js source
import re
s=open('src/classic.js').read()
P=lambda n:open('tools/p/'+n).read()
def cut(a,b,new,inc_b=False):
    global s
    i=s.index(a);j=s.index(b,i+len(a))
    if inc_b:j+=len(b)
    s=s[:i]+new+s[j:]
def rep(a,b):
    global s
    assert s.count(a)==1,(s.count(a),a[:60]);s=s.replace(a,b)
old=s
# render segments from the old code
def seg(a,b,inc_b=False):
    i=old.index(a);j=old.index(b,i);return old[i:j+(len(b) if inc_b else 0)]
S1=seg("  // nearest coloured lights: [dist2, x,y,z, colour, strength, radius]","  lights.sort((a,b)=>a[0]-b[0]);",True)
S1=S1.replace("lights.push([d-6,q.lx,0.9,q.lz,SCONCE_COL,1.25*fl,4.6])","lights.push([d-6,q.lx,0.9,q.lz,SCONCE_COL,1.25*fl,4.6,'s'+q.lx+','+q.lz])")
S1=S1.replace("lights.push([d-30,F.safe.x,0.85,F.safe.z,[1.0,0.56,0.2],2.3*fl,7.5])","lights.push([d-30,F.safe.x,0.85,F.safe.z,[1.0,0.56,0.2],2.3*fl,7.5,'safe'])")
assert "'safe'])" in S1 and "'s'+q.lx" in S1
S2=seg("  sprList.length=0;\n  CH.n=0;","  if(CH.n){gl.useProgram(matProg.p)")
S2=S2.replace("  sprList.length=0;\n  CH.n=0;","""  sprList.length=0;
  CH.n=0;
  for(const tr of F.traps){
    if((tr.x-ex)**2+(tr.z-ez)**2>16*16)continue;
    const h=0.04+trapExt(tr,R.time)*0.44;
    for(const o2 of[[-0.22,-0.22],[0.22,-0.22],[-0.22,0.22],[0.22,0.22],[0,0]])emit(mesh6('cone'),flat,[tr.x+o2[0],0,tr.z+o2[1]],[1,h,1],METAL);
  }
  for(const it of F.items){
    if(it.got||(it.type!=='shard'&&it.type!=='gem'))continue;
    if((it.x-ex)**2+(it.z-ez)**2>18*18)continue;
    const y=0.44+Math.sin(t*2.2+it.ph)*0.05,c=ITEM[it.type].col,sh=it.type==='shard';
    emit(mesh6('octa'),{p:[it.x,sh?y:y-0.12,it.z],R:rYaw((sh?t*1.4:t*2)+it.ph),lo:ZERO3},ZERO3,sh?[0.1,0.23,0.1]:[0.075,0.09,0.075],[c[0],c[1],c[2],11]);
  }""")
S3=seg("  // sprites\n  for(const it of F.items){","  gl.useProgram(spriteProg.p);")
render=P('render.js').replace('/*S1*/',S1).replace('/*S2*/',S2).replace('/*S3*/',S3)
# 1 header
cut("'use strict';","if(gl&&Q>0&&!gl.getExtension('EXT_color_buffer_float')&&!gl.getExtension('EXT_color_buffer_half_float'))Q=0;\n",P('head.js'),True)
# 2 shaders -> materials
cut("/* ---------- GL helpers ---------- */","/* ---------- procedural textures ---------- */",P('materials.js'))
# 3,4 textures
cut("  const tex=gl.createTexture();\n  gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);","  return {tex,nrm};",P('tex_tail.js').rstrip('\n'),True)
cut("  const tex=gl.createTexture();\n  gl.bindTexture(gl.TEXTURE_2D,tex);","  return tex;",P('spr_tail.js').rstrip('\n'),True)
rep("const WT=makeWorldTextures(), worldTex=WT.tex, nrmTex=WT.nrm, spriteTex=makeSpriteTexture();","const WT=makeWorldTextures(), spriteTex=makeSpriteTexture();")
# 6,7 world mesh
cut("const worldVAO=gl.createVertexArray()","function buildMesh(F){","let worldMesh=null;\n")
cut("  gl.bindBuffer(gl.ARRAY_BUFFER,worldVBO);","/* ---------- 3D prop meshes ---------- */",P('mesh_tail.js'))
# 8
cut("const PST=9*4;","const decor=matVAO(),chars=matVAO();\n","",True)
# 9
cut("  gl.bindBuffer(gl.ARRAY_BUFFER,decor.vbo);","  decor.count=DEC.n;","  upload(decorMesh,DEC);",True)
# 10
cut("/* ---------- sprites ---------- */","/* ---------- game state ---------- */",P('sprites.js')+"\n")
# 11
cut("/* ---------- render ---------- */","/* ---------- self-check",render)
open('src/game.js','w').write(s)
import subprocess
print(len(s));print(subprocess.run("grep -n 'gl\\.\\|matProg\\|propProg\\|worldProg\\|drawProp\\|drawMat\\|MESH\\.\\|NL\\b\\|lpos\\|blk\\b' src/game.js | cut -c1-150",shell=True,capture_output=True,text=True).stdout)
