import assert from 'node:assert/strict';
import {advanceLiftMotion} from '../src/mine-shaft.js';

const dt=1/60;
for(const destination of [8.2,24.6,328]){
  const ride={travel:0,extra:0,speed:0};
  let previousDistance=0,maxSpeed=0,docked=false;
  for(let i=0;i<6500&&!docked;i++){
    const ready=i>=420;
    const previousSpeed=ride.speed;
    docked=advanceLiftMotion(ride,dt,destination,ready);
    const distance=ride.travel+ride.extra;
    assert.ok(distance>=previousDistance,'the car always moves down during descent');
    assert.ok(Math.abs(ride.speed-previousSpeed)<=2.1*dt+1e-9,'speed changes gradually');
    if(!ready)assert.ok(!docked&&ride.travel<=destination-3.8,'the car leaves room for the landing to load');
    maxSpeed=Math.max(maxSpeed,ride.speed);
    previousDistance=distance;
  }
  assert.ok(docked,'the car eventually docks');
  assert.equal(ride.travel,destination);
  assert.ok(ride.speed<0.08,'the car approaches the landing slowly');
  assert.ok(maxSpeed<=6);
  if(destination===8.2)assert.ok(ride.extra>0,'the car can continue through rock while waiting');
}

const delayed={travel:0,extra:0,speed:2.2};
advanceLiftMotion(delayed,0.25,8.2,true);
assert.ok(delayed.travel<0.13,'a late render frame does not skip down the shaft');
console.log('Lift acceleration, braking, loading extension, and frame-delay limits passed.');
