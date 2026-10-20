import { COMMON } from "./shaders.ts";

/**
 * One analytic pass for floor, rails, cushions, cloth, markers and pockets. The floor sits 0.76 m below the
 * bed; its irradiance is occluded by the table slab along each lamp ray (soft edge from the lamp's 0.12 m radius).
 * Throats follow the tapered jaw facings; each drop hole has a leather rim set into the rail.
 */
export const TABLE_FS = COMMON + `
in vec2 vP;out vec4 o;
uniform vec2 uH;uniform float uRail,uCush,uPx;
uniform vec3 uCloth,uRailC,uSight;
uniform vec4 uPk[6];uniform float uHalf[6];uniform float uTaper[6];uniform vec3 uHole[6];
const float FLOOR=.76;
float box(vec2 p,vec2 h){vec2 a=abs(p)-h;return max(a.x,a.y);}
vec3 floorCol(vec2 p){
  vec3 P=vec3(p,-FLOOR);float e=0.;
  for(int i=0;i<2;i++){
    vec3 d=uLamp[i]-P;float r2=dot(d,d);float k=FLOOR/d.z;vec2 q=p+d.xy*k;
    float pen=.12*FLOOR/(uLamp[i].z+FLOOR)+.01;
    e+=d.z*inversesqrt(r2)/r2*smoothstep(-pen,pen,box(q,uH+uRail));
  }
  return vec3(.050,.048,.044)*e/uE0;
}
void main(){
  vec2 p=vP,a=abs(p);
  float outer=box(p,uH+uRail);
  if(outer>uPx){o=vec4(srgb(grade(floorCol(p))),1);return;}
  float hole=1e9,throat=1e9;
  for(int i=0;i<6;i++){
    vec2 r=p-uPk[i].xy;float s=dot(r,uPk[i].zw);float lat=abs(r.x*uPk[i].w-r.y*uPk[i].z);
    throat=min(throat,max(lat-(uHalf[i]-max(s,0.)*uTaper[i]),-s));
    hole=min(hole,length(p-uHole[i].xy)-uHole[i].z);
  }
  float play=box(p,uH),cush=box(p,uH+uCush);
  vec3 cloth=lin(uCloth),col;
  bool endRail=a.x-uH.x>a.y-uH.y;
  if(play<0.||(throat<0.&&cush<0.)){
    col=cloth*irr(vec3(p,0),vec3(0,0,1));
    float mk=min(min(length(p-vec2(uH.x*.5,0.)),length(p-vec2(-uH.x*.5,0.))),length(p));
    float line=max(abs(p.x+uH.x*.5)-.0007,0.)+max(a.y-uH.y,0.);
    col=mix(col,vec3(.78,.77,.72)*irr(vec3(p,0),vec3(0,0,1)),(1.-smoothstep(.0055-uPx,.0055+uPx,mk))+.35*(1.-smoothstep(0.,uPx*1.5,line)));
  }else if(cush<0.){
    float t=clamp(endRail?(a.x-uH.x)/uCush:(a.y-uH.y)/uCush,0.,1.);
    vec3 n=normalize(endRail?vec3(-sign(p.x)*(.75-.6*t),0,1):vec3(0,-sign(p.y)*(.75-.6*t),1));
    col=cloth*.95*irr(vec3(p,.03),n);
  }else{
    float e=-outer;vec2 out2=endRail?vec2(sign(p.x),0):vec2(0,sign(p.y));
    vec3 n=normalize(vec3(out2*(1.-smoothstep(0.,.014,e))*.9,1));
    col=lin(uRailC)*irr(vec3(p,.045),n);
    vec2 sp=endRail?vec2(a.x-uH.x-(uRail+uCush)*.5,mod(p.y+uH.y*.5,uH.y*.5)-uH.y*.25):vec2(mod(p.x+uH.x*.25,uH.x*.25)-uH.x*.125,a.y-uH.y-(uRail+uCush)*.5);
    vec2 dd=abs(endRail?sp.yx:sp);float dm=dd.x/.011+dd.y/.0055-1.;
    col=mix(lin(uSight)*irr(vec3(p,.045),vec3(0,0,1))*1.1,col,smoothstep(-uPx/.0055,uPx/.0055,dm));
    float rim=1.-smoothstep(.012-uPx,.012+uPx,hole);
    col=mix(col,vec3(.018,.011,.007)*irr(vec3(p,.045),vec3(0,0,1)),rim);
  }
  vec3 hc=cloth*.02*smoothstep(-uHalf[0],0.,hole)+vec3(.002);
  col=mix(hc,col,smoothstep(-uPx,uPx,hole));
  o=vec4(srgb(grade(col)),1);
}`;
