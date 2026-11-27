// Update Log terminal: exists in the lobby, lists every post, clears NEW once opened, closes when you walk away.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {NEWS} from '../src/news.js';

assert.ok(NEWS.length>0);
for(const post of NEWS){
  assert.match(post.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(post.title&&post.body);
}
for(let i=1;i<NEWS.length;i++)assert.ok(NEWS[i-1].date>=NEWS[i].date,'posts are newest first');

const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.LIFT_BROWSER||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const build=new URL('../index.html',import.meta.url);
const shots=process.env.SHOTS;
if(shots)mkdirSync(shots,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1120,height:700},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(build.href);
  await page.waitForFunction(()=>window.__game?.hub&&window.__game.state==='title');
  await page.waitForFunction(()=>__game.hub.lobbyReady,null,{timeout:60000});
  const step=()=>page.evaluate(()=>{__game.hub.update(1/60)});
  const shot=async name=>{if(shots){await page.waitForTimeout(400);await page.screenshot({path:`${shots}/${name}.png`})}};

  assert.equal(await page.evaluate(()=>__game.hub.newsUnseen),true,'newest post starts unseen');
  await page.evaluate(()=>__game.hub.place(15.35,11.5,Math.PI,0.1));
  await step();
  await shot('news-idle');
  await page.evaluate(()=>__game.hub.place(3,-2,Math.PI,0.12));
  await shot('news-lobby');

  await page.evaluate(()=>{__game.hub.place(15.35,11.5,Math.PI,0.1);__game.openStation('news')});
  await step();
  const open=await page.evaluate(()=>({
    active:__game.activeStation,
    title:document.getElementById('stationTitle').textContent,
    shown:!document.querySelector('[data-station-panel=news]').hidden,
    posts:[...document.querySelectorAll('#newsList article')].map(a=>[a.querySelector('time').textContent,a.querySelector('h2').textContent,a.querySelector('p').textContent]),
    unseen:__game.hub.newsUnseen,
    stored:localStorage.getItem('emberdeep.newsSeen'),
  }));
  assert.equal(open.active,'news');
  assert.equal(open.title,'Update Log');
  assert.ok(open.shown);
  assert.deepEqual(open.posts,NEWS.map(p=>[p.date,p.title,p.body]));
  assert.equal(open.unseen,false,'opening clears NEW');
  assert.equal(open.stored,NEWS[0].date+' '+NEWS[0].title);
  await shot('news-open');

  await page.evaluate(()=>__game.hub.place(15.35,2,0,0));
  await step();
  assert.equal(await page.evaluate(()=>__game.activeStation),null,'walking away closes the panel');

  await page.reload();
  await page.waitForFunction(()=>window.__game?.hub);
  await page.waitForFunction(()=>__game.hub.lobbyReady,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>__game.hub.newsUnseen),false,'seen state persists');
  assert.deepEqual(errors,[]);
  console.log('Update Log terminal placement, posts, NEW marker and walk-away passed.');
}finally{await browser.close()}
