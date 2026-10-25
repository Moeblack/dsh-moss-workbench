// Pure 3D director math. World axes: x right, y down, z into the picture.
// Screen points are top-left pixels; only mossBBox is centered yxyx.
const rad = d => d * Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
const I = [1,0,0, 0,1,0, 0,0,1];
const mv = (m, v) => [dot(m.slice(0,3),v), dot(m.slice(3,6),v), dot(m.slice(6,9),v)];
const mm = (a, b) => a.map((_, i) => { const r = Math.floor(i/3), c = i%3; return a[r*3]*b[c]+a[r*3+1]*b[c+3]+a[r*3+2]*b[c+6]; });
function rotation(x = 0, y = 0, z = 0) {
  const [cx,sx,cy,sy,cz,sz] = [Math.cos(rad(x)),Math.sin(rad(x)),Math.cos(rad(y)),Math.sin(rad(y)),Math.cos(rad(z)),Math.sin(rad(z))];
  return mm(mm([1,0,0,0,cx,-sx,0,sx,cx], [cy,0,sy,0,1,0,-sy,0,cy]), [cz,-sz,0,sz,cz,0,0,0,1]);
}
const sizeOf = s => ({ W: Math.max(2,num(s?.canvasWidth ?? s?.width,1024)), H: Math.max(2,num(s?.canvasHeight ?? s?.height,1536)) });
const bounds = pts => [Math.min(...pts.map(p=>p.x)), Math.min(...pts.map(p=>p.y)), Math.max(...pts.map(p=>p.x)), Math.max(...pts.map(p=>p.y))];
const rectPoints = b => [{x:b[0],y:b[1]},{x:b[2],y:b[1]},{x:b[2],y:b[3]},{x:b[0],y:b[3]}];
function itemBBox(item, state) {
  if (item?.points?.length) return bounds(item.points);
  const {W,H} = sizeOf(state);
  if (item?.bbox?.length === 4) { const [y1,x1,y2,x2] = item.bbox; return [x1+W/2,y1+H/2,x2+W/2,y2+H/2]; }
  return [W*.4,H*.2,W*.6,H*.8];
}
export const BASE_FOV = 50;
export const CAMERA_LIMITS = { orbit:[-180,180], pitch:[-85,85], roll:[-60,60], distance:[.2,5], fov:[10,120], pan_x:[-3,3], pan_y:[-3,3], pan_z:[-.9,3] };
export const wrapDeg = d => ((num(d)+180)%360+360)%360-180;
export function defaultCamera() { return {enabled:false,orbit:0,pitch:0,roll:0,distance:1,fov:50,pan_x:0,pan_y:0,pan_z:0}; }
export function normalizeCamera(value = {}) {
  const c = {...defaultCamera(),...value};
  if (value.dist != null && value.distance == null) c.distance = value.dist;
  for (const [k,[lo,hi]] of Object.entries(CAMERA_LIMITS)) c[k] = clamp(k === 'orbit' ? wrapDeg(c[k]) : num(c[k],defaultCamera()[k]),lo,hi);
  c.enabled = Boolean(c.enabled);
  return c;
}
export function isBaseCamera(c) { const a = normalizeCamera(c); return Object.keys(CAMERA_LIMITS).every(k=>Math.abs(a[k]-defaultCamera()[k])<1e-8); }
export const CAMERA_PRESETS = [
  ['front','正面平视',{}], ['slight-high','略微俯拍',{pitch:15}], ['high','高机位俯拍',{pitch:40}],
  ['bird','鸟瞰',{pitch:78,distance:1.15}], ['low','低机位仰拍',{pitch:-30}],
  ['left','左前 45°',{orbit:-45}], ['right','右前 45°',{orbit:45}], ['side','右侧 90°',{orbit:90}],
  ['back','背面',{orbit:180}], ['dutch','荷兰角',{roll:15}], ['wide','广角贴近',{fov:85,distance:.55}],
  ['tele','长焦压缩',{fov:22,distance:2.4}], ['close','推近特写',{distance:.55}],
].map(([id,labelZh,camera])=>({id,labelZh,name:labelZh,camera:{...defaultCamera(),...camera,enabled:true},cam:camera}));
const focal = H => H/2/Math.tan(rad(BASE_FOV)/2);
const BACKDROP = /sky|background|backdrop|landscape|horizon|mountain|cloud|ocean|天空|晚霞|云|背景|远景|远山|群山|风景|天际|海面|大海/i;
export function estimateBody(item, state) {
  const {W,H} = sizeOf(state), [x1,y1,x2,y2] = itemBBox(item,state), w=x2-x1,h=y2-y1;
  if (item.label === 'text' || item.label === 'panel') return {anchor:'screen',z:1,thickness:.05,yaw:0};
  const words = BACKDROP.test([item.caption,item.noteZh,item.name].join(' '));
  if ((w>=W*.9 && h>=H*.6) || (words && w*h>W*H*.5) || (w>=W*.85 && (item.depth==='bg' || words))) return {anchor:'backdrop',z:6,thickness:0,yaw:0};
  const hy = num(state?.perspective?.horizon_y,H*.45);
  const z = y2>hy+H*.05 ? (H-hy)/(y2-hy) : Math.sqrt(.18*W*H/Math.max(1,w*h));
  return {anchor:'world',z:clamp(z,.4,8),thickness:item.label==='character'?.45:(w>h*3 || h>w*4)?.12:.6,yaw:0};
}
export function normalizeBody(body, item, state) {
  const b = {...estimateBody(item,state),...body};
  return {...b,anchor:['world','backdrop','screen'].includes(b.anchor)?b.anchor:'world',z:clamp(num(b.z,1),.15,12),thickness:clamp(num(b.thickness,.45),0,4),yaw:wrapDeg(b.yaw)};
}
const bodyOf = (it,s) => normalizeBody(it.body,it,s);
export function getCameraProjection(state, camera) {
  const {W,H}=sizeOf(state), items=state?.items||[];
  const world=items.filter(it=>!it.hidden && bodyOf(it,state).anchor==='world');
  const chars=world.filter(it=>it.label==='character'), pool=chars.length?chars:world;
  const area=it=>{const b=itemBBox(it,state);return (b[2]-b[0])*(b[3]-b[1]);};
  const subject=pool.reduce((best,it)=>!best||area(it)>area(best)?it:best,null);
  const pivotZ=subject?bodyOf(subject,state).z:1, D0=focal(H)*pivotZ;
  const c=normalizeCamera(camera ?? state?.camera), o=rad(c.orbit),p=rad(c.pitch),r=rad(c.roll);
  const dir=[Math.sin(o)*Math.cos(p),-Math.sin(p),-Math.cos(o)*Math.cos(p)], fwd=mul(dir,-1);
  const right0=norm(cross(fwd,[0,-1,0])), down0=cross(fwd,right0);
  const right=add(mul(right0,Math.cos(r)),mul(down0,Math.sin(r))), down=sub(mul(down0,Math.cos(r)),mul(right0,Math.sin(r)));
  const pan=add(add(mul(right,c.pan_x*D0),mul(down,c.pan_y*D0)),mul(fwd,-c.pan_z*D0));
  const C=add(add([0,0,D0],mul(dir,D0*c.distance)),pan);
  return {C,eye:C,right,down,fwd,f:H/2/Math.tan(rad(c.fov)/2),W,H,near:D0*.02,pivot:[0,0,D0],camera:c};
}
export function projectPoint3D(point, frame) {
  const p=Array.isArray(point)?point:[point.x,point.y,point.z], d=sub(p,frame.C), z=dot(d,frame.fwd);
  return z<frame.near?null:{x:frame.W/2+frame.f*dot(d,frame.right)/z,y:frame.H/2+frame.f*dot(d,frame.down)/z,z};
}
function clipSegment(a,b,frame) {
  const za=dot(sub(a,frame.C),frame.fwd),zb=dot(sub(b,frame.C),frame.fwd);
  if (za<frame.near && zb<frame.near) return null;
  if (za<frame.near || zb<frame.near) { const t=(frame.near-za)/(zb-za),p=add(a,mul(sub(b,a),t)); if(za<frame.near)a=p;else b=p; }
  return [projectPoint3D(a,frame),projectPoint3D(b,frame)];
}
export const CUBE_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
export const CUBE_FACES = [[0,1,2,3],[7,6,5,4],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]];
const transformOf = b => b.transform || {matrix:I,origin:[0,0,0]};
const transformPoint = (p,b) => {const t=transformOf(b);return add(mv(t.matrix,p),t.origin);};
export function bodyGeometry3D(item,state,body=bodyOf(item,state)) {
  const {W,H}=sizeOf(state), box=body.source?.bbox||itemBBox(item,state), z=body.source?.z??body.z;
  const [x1,y1,x2,y2]=box, width=(x2-x1)*z,height=(y2-y1)*z,depth=width*body.thickness;
  const center=[((x1+x2)/2-W/2)*z,((y1+y2)/2-H/2)*z,focal(H)*z+depth/2];
  const rot=rotation(0,-body.yaw,0), point=(x,y,zz)=>add(center,mv(rot,[x,y,zz]));
  const raw=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([x,y,zz])=>point(x*width/2,y*height/2,zz*depth/2));
  // Calibrate in world space, not after projection, so the same solid survives
  // arbitrary cameras and repeated bakes without AABB accumulation.
  const F=focal(H), baseBounds=bounds(raw.map(p=>({x:W/2+F*p[0]/p[2],y:H/2+F*p[1]/p[2]})));
  const sx=(x2-x1)/Math.max(1e-8,baseBounds[2]-baseBounds[0]),sy=(y2-y1)/Math.max(1e-8,baseBounds[3]-baseBounds[1]);
  const tx=x1-W/2-sx*(baseBounds[0]-W/2),ty=y1-H/2-sy*(baseBounds[1]-H/2);
  const calibrated=p=>transformPoint([sx*p[0]+tx*p[2]/F,sy*p[1]+ty*p[2]/F,p[2]],body);
  const corners=raw.map(calibrated), worldCenter=calibrated(center);
  return {id:item.id,anchor:body.anchor,corners,pts:corners,center:worldCenter,origin:worldCenter,dimensions:[width,height,depth],edges:CUBE_EDGES,faces:CUBE_FACES};
}

// Boytchev-style hierarchy, in native axes x forward, y up, z right.
// Fixed image-wrapper flips distinguish elbow flexion from knee flexion.
export const MANNEQUIN_TYPES = [
  {id:'Female',labelZh:'女性',height:1.65,shoulder:5,hip:4,headScale:1.5/2.15},
  {id:'Male',labelZh:'男性',height:1.8,shoulder:6,hip:4,headScale:1.5/2.3},
  {id:'Child',labelZh:'儿童',height:1.15,shoulder:5,hip:3.5,headScale:1.5/1.65},
];
export const MANNEQUIN_JOINTS = [
  {id:'body',labelZh:'整体',controls:['bend','turn','tilt']}, {id:'pelvis',labelZh:'骨盆',controls:['bend','turn','tilt']},
  {id:'torso',labelZh:'躯干',controls:['bend','turn','tilt']}, {id:'head',labelZh:'头部',controls:['nod','turn','tilt']},
  ...['l','r'].flatMap(side=>[
    {id:`${side}_arm`,labelZh:`${side==='l'?'左':'右'}肩`,controls:['raise','straddle','turn']},
    {id:`${side}_elbow`,labelZh:`${side==='l'?'左':'右'}肘`,controls:['bend','turn','tilt']},
    {id:`${side}_wrist`,labelZh:`${side==='l'?'左':'右'}腕`,controls:['bend','turn','tilt']},
    {id:`${side}_leg`,labelZh:`${side==='l'?'左':'右'}髋`,controls:['raise','straddle','turn']},
    {id:`${side}_knee`,labelZh:`${side==='l'?'左':'右'}膝`,controls:['bend','turn','tilt']},
    {id:`${side}_ankle`,labelZh:`${side==='l'?'左':'右'}踝`,controls:['bend','turn','tilt']},
  ]),
];
export const POSE_PRESETS = [
  ['stand','站立标准',{}],
  ['profile','侧脸平静注视',{body:{turn:80},head:{turn:10}}],
  ['counter','用力反击/压制',{body:{bend:18,turn:-25},torso:{turn:35},r_arm:{raise:100,straddle:20},r_elbow:{bend:15},l_arm:{raise:45},l_elbow:{bend:115},l_leg:{raise:20,straddle:24},r_leg:{raise:-25,straddle:20},l_knee:{bend:30}}],
  ['draw','拔刀对峙',{body:{turn:-30},torso:{turn:20},r_arm:{raise:55,straddle:-25},r_elbow:{bend:90},l_arm:{raise:25,straddle:15},l_elbow:{bend:70},l_leg:{raise:15,straddle:22},r_leg:{raise:-15,straddle:22},l_knee:{bend:20},r_knee:{bend:15}}],
  ['weapon','双手持武',{l_arm:{raise:70,straddle:-15,turn:20},r_arm:{raise:75,straddle:-15,turn:20},l_elbow:{bend:55},r_elbow:{bend:55},torso:{turn:-10},l_leg:{straddle:15},r_leg:{straddle:15}}],
  ['run','奔跑冲刺',{body:{bend:22},l_leg:{raise:65},r_leg:{raise:-38},l_knee:{bend:25},r_knee:{bend:100},l_arm:{raise:-35},r_arm:{raise:55},l_elbow:{bend:85},r_elbow:{bend:90}}],
  ['jump','跳跃滞空',{body:{bend:-10,tilt:12},l_arm:{raise:150,straddle:35},r_arm:{raise:125,straddle:45},l_elbow:{bend:20},r_elbow:{bend:35},l_leg:{raise:45,straddle:20},r_leg:{raise:-20,straddle:15},l_knee:{bend:105},r_knee:{bend:125}}],
  ['guard','防御后仰',{body:{bend:-25},l_arm:{raise:65,straddle:15},r_arm:{raise:55,straddle:10},l_elbow:{bend:115},r_elbow:{bend:110},l_leg:{raise:10,straddle:16},r_leg:{raise:-15,straddle:16},l_knee:{bend:20},r_knee:{bend:30}}],
  ['lookback','回眸注视',{body:{turn:150},torso:{turn:-20},head:{turn:-65,tilt:8},l_arm:{raise:-10},r_arm:{raise:10}}],
  ['sit','坐姿休息',{l_leg:{raise:90,straddle:10},r_leg:{raise:90,straddle:10},l_knee:{bend:90},r_knee:{bend:90},l_arm:{raise:30},r_arm:{raise:30},l_elbow:{bend:35},r_elbow:{bend:35},torso:{bend:8}}],
  ['punch','俯身冲拳',{body:{bend:40,turn:-25},torso:{turn:35},r_arm:{raise:110},r_elbow:{bend:0},l_arm:{raise:-20},l_elbow:{bend:110},l_leg:{raise:35,straddle:18},r_leg:{raise:-35,straddle:18},l_knee:{bend:35},r_knee:{bend:15},head:{nod:-20}}],
  ['proud','背手傲立',{torso:{bend:-6},head:{nod:-12},l_arm:{raise:-30,straddle:-8},r_arm:{raise:-30,straddle:-8},l_elbow:{bend:70},r_elbow:{bend:70},l_leg:{straddle:12},r_leg:{straddle:12}}],
].map(([id,labelZh,joints])=>({id,labelZh,name:labelZh,joints}));
const neutral = () => Object.fromEntries(MANNEQUIN_JOINTS.map(j=>[j.id,Object.fromEntries(j.controls.map(k=>[k, k==='straddle'?7:k==='bend'&&j.id.endsWith('_elbow')?15:0]))]));
export function normalizeMannequin(value = {}) {
  const v=typeof value==='string'?{preset:value}:value||{};
  const type=MANNEQUIN_TYPES.find(t=>t.id.toLowerCase()===String(v.type||'Female').toLowerCase())?.id||'Female';
  const preset=POSE_PRESETS.find(p=>p.id===v.preset || p.labelZh===v.preset)||POSE_PRESETS[0], joints=neutral();
  for(const spec of MANNEQUIN_JOINTS) {
    const input={...preset.joints[spec.id],...(v.joints?.[spec.id]||{})};
    for(const k of spec.controls) joints[spec.id][k]=clamp(num(input[k],joints[spec.id][k]),-180,180);
    for(const k of ['x','y','z']) if(input[k]!=null)joints[spec.id][k]=clamp(num(input[k]),-180,180);
  }
  return {...v,enabled:v.enabled!==false,type,preset:preset.id,joints};
}
export function mirrorPose(value = {}) {
  const v=normalizeMannequin(value), joints={};
  for(const spec of MANNEQUIN_JOINTS) {
    const other=spec.id.startsWith('l_')?'r_'+spec.id.slice(2):spec.id.startsWith('r_')?'l_'+spec.id.slice(2):spec.id;
    const q={...v.joints[other]};
    if(!spec.id.includes('_')) {q.turn=-(q.turn||0)||0;q.tilt=-(q.tilt||0)||0;}
    if(q.x!=null)q.x=-q.x;
    if(q.y!=null)q.y=-q.y;
    joints[spec.id]=q;
  }
  return {...v,joints};
}
function jointRotation(q,kind,side=1) {
  let x=0,y=0,z=0;
  if(kind==='limb') {x=-side*q.straddle;y=-side*q.turn;z=q.raise;}
  else if(kind==='hinge') {x=q.tilt;y=q.turn;z=q.bend;}
  else if(kind==='wrist') {x=-side*q.bend;y=side*q.turn;z=side*q.tilt;}
  else if(kind==='head') {x=-q.tilt/2;y=q.turn/2;z=-q.nod/2;}
  else {x=kind==='body'?q.tilt:-q.tilt;y=q.turn;z=-q.bend;}
  return rotation(q.x??x,q.y??y,q.z??z);
}
export function computeMannequinSkeleton3D(item,state,body=bodyOf(item,state)) {
  const m=normalizeMannequin(item.mannequin), type=MANNEQUIN_TYPES.find(t=>t.id===m.type), q=m.joints;
  const {W,H}=sizeOf(state), box=body.source?.bbox||itemBBox(item,state), z=body.source?.z??body.z;
  const [x1,y1,x2,y2]=box, headScale=type.headScale, headY=(4.7+(1.8-type.height)/.65*1.1);
  const top=4+15+headY+8*headScale, bottom=-3-15-14-2, total=top-bottom;
  const scale=(y2-y1)*z/total;
  const origin=[((x1+x2)/2-W/2)*z,(y2-H/2)*z+bottom*scale,focal(H)*z];
  const orient=rotation(0,-body.yaw,0), nativeToWorld=p=>transformPoint(add(origin,mv(orient,mul([p[2],-p[1],-p[0]],scale))),body);
  const frames={},native={},joints={},segments=[];
  function node(id,parent,offset,rot=I,wrapper=I) {
    const f=parent?frames[parent]:{p:[0,0,0],r:I};
    const p=add(f.p,mv(f.r,offset)), r=mm(f.r,rot);
    frames[id]={p,r:mm(r,wrapper)};native[id]=p;joints[id]=nativeToWorld(p);
  }
  function edge(from,to,radius) {
    const r=radius*scale, matrix=transformOf(body).matrix;
    segments.push({from,to,a:joints[from],b:joints[to],radius:r,radiusVectors:[[r,0,0],[0,r,0],[0,0,r]].map(v=>mv(matrix,v))});
  }
  node('body',null,[0,0,0],jointRotation(q.body,'body'));
  node('pelvis','body',[0,0,0],jointRotation(q.pelvis,'torso'));
  node('torso','pelvis',[-2,4,0],jointRotation(q.torso,'torso'));
  node('neck','torso',[0,15,0],jointRotation(q.head,'head'));
  node('head','neck',[1,headY,0],jointRotation(q.head,'head'));
  edge('pelvis','torso',4);edge('torso','neck',4);edge('neck','head',1.5);
  for(const [prefix,side] of [['l',-1],['r',1]]) {
    node(prefix+'_shoulder','torso',[0,14,side*type.shoulder],jointRotation(q[prefix+'_arm'],'limb',side),rotation(0,0,180));
    node(prefix+'_elbow',prefix+'_shoulder',[0,11,0],jointRotation(q[prefix+'_elbow'],'hinge'));
    node(prefix+'_wrist',prefix+'_elbow',[0,11,0],jointRotation(q[prefix+'_wrist'],'wrist',side),rotation(0,-side*90,0));
    node(prefix+'_hand',prefix+'_wrist',[0,3.5,0]);
    node(prefix+'_hip','pelvis',[-1,-3,side*type.hip],jointRotation(q[prefix+'_leg'],'limb',side),rotation(180,0,0));
    node(prefix+'_knee',prefix+'_hip',[0,15,0],jointRotation(q[prefix+'_knee'],'hinge'));
    node(prefix+'_ankle',prefix+'_knee',[0,14,0],jointRotation(q[prefix+'_ankle'],'wrist',side));
    node(prefix+'_toe',prefix+'_ankle',[4,2,0]);
    edge('neck',prefix+'_shoulder',2);edge(prefix+'_shoulder',prefix+'_elbow',1.7);edge(prefix+'_elbow',prefix+'_wrist',1.25);edge(prefix+'_wrist',prefix+'_hand',1);
    edge('pelvis',prefix+'_hip',2.5);edge(prefix+'_hip',prefix+'_knee',2.2);edge(prefix+'_knee',prefix+'_ankle',1.7);edge(prefix+'_ankle',prefix+'_toe',1.2);
  }
  const hf=frames.head, headCenter=add(hf.p,mv(hf.r,[0,2*headScale,0]));
  const headRadii=[4.5*headScale,6*headScale,3.75*headScale], surface=[];
  for(let latitude=0;latitude<=8;latitude++) for(let longitude=0;longitude<16;longitude++) {
    const a=Math.PI*latitude/8,b=Math.PI*2*longitude/16;
    const v=[headRadii[0]*Math.sin(a)*Math.cos(b),headRadii[1]*Math.cos(a),headRadii[2]*Math.sin(a)*Math.sin(b)];
    surface.push(nativeToWorld(add(headCenter,mv(hf.r,v))));
  }
  const center=nativeToWorld(headCenter),nose=nativeToWorld(add(headCenter,mv(hf.r,[headRadii[0]*1.25,0,0])));
  return {id:item.id,type:m.type,joints,segments,head:{center,nose,surface,radius:6*headScale*scale},origin:nativeToWorld([0,0,0]),scale,frames};
}
export const mannequinWorld = computeMannequinSkeleton3D;
function convexHull(points) {
  const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  if(p.length<3)return p;
  const turn=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lo=[],hi=[];
  for(const pt of p){while(lo.length>1&&turn(lo.at(-2),lo.at(-1),pt)<=0)lo.pop();lo.push(pt);}
  for(const pt of p.reverse()){while(hi.length>1&&turn(hi.at(-2),hi.at(-1),pt)<=0)hi.pop();hi.push(pt);}
  return [...lo.slice(0,-1),...hi.slice(0,-1)];
}
export function projectMannequinSkeleton3D(skeleton,frame) {
  const joints=Object.fromEntries(Object.entries(skeleton.joints).map(([id,p])=>[id,projectPoint3D(p,frame)])),segments=[],all=[];
  for(const s of skeleton.segments){
    const ends=clipSegment(s.a,s.b,frame);if(!ends)continue;
    const [a,b]=ends,depth=(a.z+b.z)/2, samples=[];
    for(const endpoint of [s.a,s.b])for(const vector of s.radiusVectors||[[s.radius,0,0],[0,s.radius,0],[0,0,s.radius]])for(const sign of [-1,1]){const p=projectPoint3D(add(endpoint,mul(vector,sign)),frame);if(p)samples.push(p);}
    const sb=samples.length?bounds(samples):bounds([a,b]);
    const radius=Math.max(Math.abs(sb[0]-Math.min(a.x,b.x)),Math.abs(sb[1]-Math.min(a.y,b.y)),Math.abs(sb[2]-Math.max(a.x,b.x)),Math.abs(sb[3]-Math.max(a.y,b.y)));
    segments.push({...s,a,b,radius,depth});all.push(...samples,a,b);
  }
  const surface=skeleton.head.surface.map(p=>projectPoint3D(p,frame)).filter(Boolean),center=projectPoint3D(skeleton.head.center,frame),nose=projectPoint3D(skeleton.head.nose,frame);
  let head=null;
  if(surface.length&&center){const b=bounds(surface);head={center,rx:(b[2]-b[0])/2,ry:(b[3]-b[1])/2,outline:convexHull(surface),direction:nose?{a:center,b:nose}:null};all.push(...surface);}
  return {joints,segments,head,bbox:all.length?bounds(all):null};
}

function overlap(a,b) {return Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));}
function attachmentFor(item,state,worldSkeletons) {
  if(item.label!=='object')return null;
  const explicit=item.attachment||item.body?.attachment, box=itemBBox(item,state),area=Math.max(1,(box[2]-box[0])*(box[3]-box[1]));
  if(explicit?.joint==='none')return null;
  let holder=(state.items||[]).find(it=>it.id===(explicit?.holderId??explicit?.holder));
  if(!holder && (!explicit || explicit.joint==='auto' || explicit.holderId==='auto')) {
    let score=.1;
    for(const it of state.items||[]) {
      if(it.hidden||it.label!=='character'||!worldSkeletons[it.id])continue;
      const hb=itemBBox(it,state),ha=(hb[2]-hb[0])*(hb[3]-hb[1]);if(ha<=area)continue;
      const r=overlap(box,hb)/area+(item.group && it.group===item.group ? .25 : 0);
      if(r>score){score=r;holder=it;}
    }
  }
  const sk=holder&&worldSkeletons[holder.id];if(!sk)return null;
  let joint=explicit?.joint||'auto';
  if(joint==='body')joint='pelvis';
  if(!['l_wrist','r_wrist','pelvis'].includes(joint)) {
    const base=getCameraProjection(state,defaultCamera()),cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2;
    const dist=id=>{const p=projectPoint3D(sk.joints[id],base);return p?Math.hypot(p.x-cx,p.y-cy):Infinity;};
    joint=dist('l_wrist')<dist('r_wrist')?'l_wrist':'r_wrist';
  }
  return {holderId:holder.id,joint,point:sk.joints[joint],offset:explicit?.offset||[0,0,0],explicit:Boolean(explicit)};
}
function projectedBBox(raw,frame,hidden=false) {
  if(!raw)return {raw:[0,0,0,0],bbox:[0,0,0,0],visible:false,partial:true};
  const bbox=[clamp(raw[0],0,frame.W),clamp(raw[1],0,frame.H),clamp(raw[2],0,frame.W),clamp(raw[3],0,frame.H)];
  const visible=!hidden&&bbox[2]>bbox[0]&&bbox[3]>bbox[1];
  return {raw,bbox,visible,partial:raw.some((v,i)=>Math.abs(v-bbox[i])>1e-6)};
}
export function projectLayout3D(state, camera) {
  const c=normalizeCamera(camera??state?.camera),active=c.enabled,frame=getCameraProjection(state,active?c:defaultCamera()),base=getCameraProjection(state,defaultCamera());
  const items={},geometry={},skeletons={},worldSkeletons={};
  for(const item of state.items||[]) {
    const body=bodyOf(item,state);geometry[item.id]=bodyGeometry3D(item,state,body);
    if(item.label==='character'&&item.mannequin?.enabled!==false&&body.anchor==='world')worldSkeletons[item.id]=computeMannequinSkeleton3D(item,state,body);
  }
  for(const item of state.items||[]) {
    const body=bodyOf(item,state),box=itemBBox(item,state),geo=geometry[item.id],sk=worldSkeletons[item.id];
    if(body.anchor!=='world') {items[item.id]={id:item.id,anchor:body.anchor,...projectedBBox(box,frame,item.hidden),points:item.points||rectPoints(box),corners:null,depth:body.anchor==='backdrop'?Infinity:0,skeleton:null};continue;}
    const attach=attachmentFor(item,state,worldSkeletons);
    if(attach){
      const hp=attach.point,basePoint=projectPoint3D(hp,base);
      // Auto holders change depth along the original viewing rays, preserving
      // both the prop's editable position and apparent size at the base view.
      const scale=attach.explicit?1:Math.max(.01,hp[2]/Math.max(1e-6,geo.center[2]));
      const offset=attach.explicit?add(sub(hp,geo.center),attach.offset):[0,0,0];
      geo.corners=geo.corners.map(p=>add(mul(p,scale),offset));geo.pts=geo.corners;geo.center=add(mul(geo.center,scale),offset);
      geo.attachment={...attach,basePoint,scale,translation:offset};
    }
    const corners=geo.corners.map(p=>projectPoint3D(p,frame));
    const clipped=CUBE_EDGES.flatMap(([a,b])=>clipSegment(geo.corners[a],geo.corners[b],frame)||[]);
    const projectedSkeleton=sk?projectMannequinSkeleton3D(sk,frame):null;
    if(projectedSkeleton)skeletons[item.id]=projectedSkeleton;
    let raw=clipped.length?bounds(clipped):null;
    if(projectedSkeleton?.bbox && item.mannequin?.autoFit!==false){
      const sb=projectedSkeleton.bbox;
      raw=raw?[Math.min(raw[0],sb[0]),Math.min(raw[1],sb[1]),Math.max(raw[2],sb[2]),Math.max(raw[3],sb[3])]:sb;
    }
    const b=projectedBBox(raw,frame,item.hidden),depthPoint=projectPoint3D(geo.center,frame);
    const mossBBox=[b.bbox[1]-frame.H/2,b.bbox[0]-frame.W/2,b.bbox[3]-frame.H/2,b.bbox[2]-frame.W/2];
    items[item.id]={id:item.id,anchor:'world',...b,mossBBox,points:raw?rectPoints(raw):[],corners,depth:depthPoint?.z??-1,skeleton:projectedSkeleton,attachment:attach?{holderId:attach.holderId,joint:attach.joint}:null};
  }
  const all=state.items||[],back=all.filter(it=>items[it.id].anchor==='backdrop'),screen=all.filter(it=>items[it.id].anchor==='screen'),world=all.filter(it=>items[it.id].anchor==='world');
  if(active&&!isBaseCamera(c))world.sort((a,b)=>items[b.id].depth-items[a.id].depth);
  const direction=v=>{const z=dot(v,frame.fwd);return z>1e-6?{x:frame.W/2+frame.f*dot(v,frame.right)/z,y:frame.H/2+frame.f*dot(v,frame.down)/z}:null;};
  const hd=norm([frame.fwd[0],0,frame.fwd[2]]),side=norm(cross([0,-1,0],hd)),a=direction(add(hd,mul(side,.6))),b=direction(sub(hd,mul(side,.6)));
  return {items,order:[...back,...world,...screen].map(it=>it.id),frame,base,geometry,worldSkeletons,skeletons,horizon:a&&b?{a,b}:null,vp:direction([0,0,1])};
}
export function bakeCameraToItems(state) {
  const camera=normalizeCamera(state.camera);
  if(!camera.enabled||isBaseCamera(camera))return state;
  const projection=projectLayout3D(state),f=projection.frame,k=focal(f.H)/f.f;
  const A=[...mul(f.right,k),...mul(f.down,k),...f.fwd],t=mul(mv(A,f.C),-1);
  const byId=new Map((state.items||[]).map(it=>[it.id,it]));
  const items=projection.order.map(id=>{
    const item=byId.get(id),p=projection.items[id],body=bodyOf(item,state);if(body.anchor!=='world')return item;
    const attached=projection.geometry[id].attachment;
    const old=transformOf(body),heldScale=attached?.scale??1,heldTranslation=attached?.translation||[0,0,0];
    const matrix=mm(A,old.matrix.map(v=>v*heldScale)),origin=add(mv(A,add(mul(old.origin,heldScale),heldTranslation)),t);
    // Keep the original 3D dimensions and FK root: never infer them from a
    // projected AABB. Camera bakes compose affines, not bounding-box refits.
    const source=body.source||{bbox:itemBBox(item,state),z:body.z};
    const attachment=attached?{holderId:attached.holderId,joint:attached.joint,offset:mv(A,sub(projection.geometry[id].center,attached.point))}:item.attachment;
    return {...item,points:rectPoints(p.raw),hidden:Boolean(item.hidden||!p.visible),...(attachment?{attachment}:{}),body:{...body,source,transform:{matrix,origin},z:clamp(p.depth/focal(f.H),.15,12)}};
  });
  return {...state,items,camera:{...defaultCamera(),enabled:true}};
}
export const getBodyGeometry3D = bodyGeometry3D;
export const bodyWorld = bodyGeometry3D;
export const clampCamera = normalizeCamera;
export const MANNEQUIN_POSE_PRESETS = POSE_PRESETS;
export const MOSS_CAMERA_PRESETS = CAMERA_PRESETS;
export const MOSS_POSE_PRESETS = POSE_PRESETS;
export const MOSS_MANNEQUIN_TYPES = MANNEQUIN_TYPES;
export const MOSS_MANNEQUIN_JOINTS = MANNEQUIN_JOINTS;
export const normalizePose3D = normalizeMannequin;
export const mirrorMannequinPose = mirrorPose;
export const projectLayout = projectLayout3D;
export const rebaseCamera = bakeCameraToItems;
