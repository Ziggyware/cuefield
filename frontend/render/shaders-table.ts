import { COMMON } from "./shaders.ts";

export const TABLE_FS = COMMON + `
in vec2 vP;out vec4 o;
uniform vec2 uH;uniform float uRail,uCush,uPx;
uniform vec3 uCloth,uRailC,uSight;
uniform vec4 uPk[6];uniform float uHalf[6];uniform float uTaper[6];uniform float uMouthHalf[6];uniform float uFunnel[6];uniform vec3 uHole[6];uniform vec3 uJaw[12];
const float FLOOR=.76;

float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float box(vec2 p,vec2 h){vec2 a=abs(p)-h;return max(a.x,a.y);}

vec3 floorCol(vec2 p){
  vec3 P=vec3(p,-FLOOR);float e=0.;
  for(int i=0;i<2;i++){
    vec3 d=uLamp[i]-P;float r2=max(dot(d,d),1e-5);float k=FLOOR/max(d.z,1e-5);vec2 q=p+d.xy*k;
    float pen=.12*FLOOR/max(uLamp[i].z+FLOOR,1e-5)+.01;
    e+=d.z*inversesqrt(r2)/r2*smoothstep(-pen,pen,box(q,uH+uRail));
  }
  return vec3(.050,.048,.044)*e/uE0;
}

void main(){
  vec2 p=vP,a=abs(p);
  float outer=box(p,uH+uRail);
  if(outer>uPx){o=vec4(srgb(grade(floorCol(p))),1.0);return;}
  float hole=1e9,throat=1e9,jaw=1e9;
  for(int i=0;i<6;i++){
    vec2 r=p-uPk[i].xy;float s=dot(r,uPk[i].zw);float lat=abs(r.x*uPk[i].w-r.y*uPk[i].z);
    float sm=s+uFunnel[i];
    float hw=sm<0.?uMouthHalf[i]:mix(uMouthHalf[i],uHalf[i],clamp(sm/max(uFunnel[i],1e-4),0.,1.));
    hw=sm>uFunnel[i]?uHalf[i]-max(sm-uFunnel[i],0.)*uTaper[i]:hw;
    throat=min(throat,max(lat-hw,-sm));
    hole=min(hole,length(p-uHole[i].xy)-uHole[i].z);
  }
  for(int i=0;i<12;i++) jaw=min(jaw,length(p-uJaw[i].xy)-uJaw[i].z);
  float play=box(p,uH),cush=box(p,uH+uCush);
  vec3 cloth=lin(uCloth),alb;
  
  float grain = mix(0.94, 1.06, hash(p * 800.0));
  cloth *= grain;
  
  vec3 p_irr=vec3(p,0.0);
  vec3 n_irr=vec3(0.0,0.0,1.0);
  bool endRail=a.x-uH.x>a.y-uH.y;
  
  if(play<0.||(throat<0.&&cush<0.)){
    alb=cloth;
    float mk=min(min(length(p-vec2(uH.x*.5,0.)),length(p-vec2(-uH.x*.5,0.))),length(p));
    float line=max(abs(p.x+uH.x*.5)-.0007,0.)+max(a.y-uH.y,0.);
    alb=mix(alb,vec3(.78,.77,.72),(1.-smoothstep(.0055-uPx,.0055+uPx,mk))+.35*(1.-smoothstep(0.,uPx*1.5,line)));
  }else if(cush<0.){
    float t=clamp(endRail?(a.x-uH.x)/uCush:(a.y-uH.y)/uCush,0.,1.);
    n_irr=normalize(endRail?vec3(-sign(p.x)*(.75-.6*t),0.0,1.0):vec3(0.0,-sign(p.y)*(.75-.6*t),1.0));
    p_irr=vec3(p,.03);
    alb=cloth*.95;
  }else{
    float e=-outer;vec2 out2=endRail?vec2(sign(p.x),0.0):vec2(0.0,sign(p.y));
    n_irr=normalize(vec3(out2*(1.-smoothstep(0.,.014,e))*.9,1.0));
    p_irr=vec3(p,.045);
    vec2 sp=endRail?vec2(a.x-uH.x-(uRail+uCush)*.5,mod(p.y+uH.y*.5,uH.y*.5)-uH.y*.25):vec2(mod(p.x+uH.x*.25,uH.x*.25)-uH.x*.125,a.y-uH.y-(uRail+uCush)*.5);
    vec2 dd=abs(endRail?sp.yx:sp);float dm=dd.x/.011+dd.y/.0055-1.;
    float sightMask=smoothstep(-uPx/.0055,uPx/.0055,dm);
    float rim=1.-smoothstep(.012-uPx,.012+uPx,hole);
    float lip=1.-smoothstep(0.,.014,jaw);
    
    vec3 woodCol = lin(uRailC) * mix(0.96, 1.04, hash(p * 200.0));
    alb=mix(lin(uSight)*1.1, woodCol, sightMask);
    alb=mix(alb,vec3(.018,.011,.007),rim);
    // Leather pocket liner wraps the jaw and blends into the wood.
    alb=mix(alb,vec3(.055,.038,.027)*(0.8+0.4*hash(p*420.0)),lip*.85);
    n_irr=mix(vec3(0.0,0.0,1.0),n_irr,max(sightMask,rim)); 
  }
  
  // Dark funnel inside the throat, independently of which surface the sample landed on.
  float funnel=1.-smoothstep(-.030,.0,throat);
  alb=mix(alb,vec3(.026,.020,.016),funnel*.9);
  vec3 col=alb*irr(p_irr,n_irr);
  vec3 hc=cloth*.02*smoothstep(-uHalf[0],0.,hole)+vec3(.002);
  col=mix(hc,col,smoothstep(-uPx,uPx,hole));
  // Thin highlight on the pocket liner just outside the hole.
  float ring=1.-smoothstep(0.,uPx*2.2,abs(hole-.0045));
  col=mix(col,vec3(.16,.11,.075),ring*.45);
  o=vec4(srgb(grade(col)),1.0);
}`;
