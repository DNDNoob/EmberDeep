// node tools/room_fxaa_test.mjs -- checks the shared room renderer against a fresh build.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch();
const build=new URL('../index.html',import.meta.url);

try{
  for(const [quality,tier] of [['low',0],['medium',1],['high',2]]){
    const page=await browser.newPage({viewport:{width:801,height:451},deviceScaleFactor:1.5});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await page.addInitScript(quality=>{
      window.__norender=true;
      localStorage.setItem('emberdeep.quality',JSON.stringify(quality));
    },quality);
    await page.goto(build.href);
    await page.waitForFunction(()=>window.__game?.previewRoom);
    const started=await page.evaluate(()=>{
      const g=window.__game;
      g.startRun('ROOMFXAA',1,true);
      g.ROOMS.theaterOpts.noMic=true;
      return {quality:g.Q,rooms:Object.keys(g.DOOR_KINDS)};
    });
    assert.equal(started.quality,tier);

    const render=kind=>page.evaluate(kind=>{
      const g=window.__game,r=g.ROOMS,renderer=g.renderer;
      if(kind&&!g.previewRoom(kind,7))throw new Error('Could not enter '+kind);
      g.resize();
      const state=r.state(),glass=state.pane||state.glass;
      const glassBefore=glass?.visible??null;
      const passes=[],original=renderer.render;
      renderer.render=function(scene,camera){
        if(scene.overrideMaterial?.isMeshNormalMaterial){
          const buffer=this.getRenderTarget();
          passes.push({name:'NormalBuffer',size:[buffer.width,buffer.height],glass:glass?.visible??null});
        }
        const name=scene.material?.name;
        if(name==='OutputShader'||name==='FXAAShader'){
          const pass={name,screen:this.getRenderTarget()===null};
          if(name==='FXAAShader')pass.pixel=scene.material.uniforms.resolution.value.toArray();
          passes.push(pass);
        }
        return original.call(this,scene,camera);
      };
      try{r.render()}finally{renderer.render=original}
      const gl=renderer.getContext();
      return {passes,width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,error:gl.getError(),glassBefore,glassAfter:glass?.visible??null};
    },kind);

    const check=({passes,width,height,error,glassBefore,glassAfter},name,viewport)=>{
      assert.equal(error,0,name+' WebGL error');
      assert.deepEqual([width,height],viewport,name+' drawing buffer size');
      assert.equal(glassAfter,glassBefore,name+' glass visibility after rendering');
      const expected=tier===0?[]:[
        {name:'OutputShader',screen:false},
        {name:'FXAAShader',screen:true,pixel:[1/width,1/height]},
      ];
      if(tier===2)expected.unshift({
        name:'NormalBuffer',size:[Math.floor(width/2),Math.floor(height/2)],glass:glassBefore===null?null:false,
      });
      assert.deepEqual(passes,expected,name+' pass order, visibility and resolution');
    };
    for(const kind of started.rooms)check(await render(kind),quality+' '+kind,[1201,676]);
    await page.setViewportSize({width:613,height:491});
    check(await render(null),quality+' after resize',[919,736]);
    assert.deepEqual(errors,[],quality+' browser errors');
    await page.close();
    console.log(quality+' passed in all '+started.rooms.length+' rooms and after resizing');
  }
}finally{
  await browser.close();
}
