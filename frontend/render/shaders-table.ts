import { COMMON } from "./shaders.ts";

/** Analytic materials stay crisp at any zoom; microdetail is band-limited by the world-pixel size. */
export const TABLE_FS = COMMON + `
in vec2 vP;out vec4 o;
uniform vec2 uH;uniform float uRail,uCush,uPx;
uniform vec3 uCloth,uRailC,uSight;
uniform vec4 uPk[6];uniform float uHalf[6];uniform float uTaper[6];uniform float uMouthHalf[6];uniform float uFunnel[6];uniform vec3 uHole[6];uniform vec3 uJaw[12];

float hash(vec2 p){
  vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);
  return fract((q.x+q.y)*q.z);
}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float box(vec2 p,vec2 h){vec2 q=abs(p)-h;return max(q.x,q.y);}
float roundBox(vec2 p,vec2 h,float r){vec2 q=abs(p)-h+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float cover(float d){return 1.-smoothstep(-uPx,uPx,d);}

vec3 floorCol(vec2 p){
  float e=max(roundBox(p,uH+uRail,.064),0.);
  float contact=1.-.56*exp(-e/.035);
  float spill=.55+.45*exp(-dot(p/(uH+vec2(.8)),p/(uH+vec2(.8))));
  float texture=1.+.025*noise(p*150.);
  return vec3(.0085,.012,.010)*contact*spill*texture;
}

void main(){
  vec2 p=vP,a=abs(p);
  float outer=roundBox(p,uH+uRail,.064);
  float hole=1e9,throat=1e9,jaw=1e9,angle=0.;
  for(int i=0;i<6;i++){
    vec2 dir=uPk[i].zw,r=p-uPk[i].xy;
    float s=dot(r,dir),lat=abs(r.x*dir.y-r.y*dir.x),sm=s+uFunnel[i];
    float hw=mix(uMouthHalf[i],uHalf[i],clamp(sm/max(uFunnel[i],1e-4),0.,1.));
    hw-=max(sm-uFunnel[i],0.)*uTaper[i];
    // The leather opening is wider than the physical drop circle and meets the recessed facing.
    vec2 hc=uHole[i].xy-dir*.012;
    float hr=max(uHole[i].z,uMouthHalf[i]*.90);
    float d=length(p-hc)-hr;
    if(d<hole){hole=d;angle=atan(p.y-hc.y,p.x-hc.x);}
    float end=dot(hc-uPk[i].xy,dir)+hr*.5;
    throat=min(throat,max(max(lat-hw,-sm),s-end));
  }
  float opening=hole;
  // Leather hoods on side pockets sit proud of the cabinet.
  outer=min(outer,hole-.013);
  if(outer>uPx*1.5){o=vec4(srgb(grade(floorCol(p))),1);return;}
  for(int i=0;i<12;i++)jaw=min(jaw,length(p-uJaw[i].xy)-uJaw[i].z);

  float play=box(p,uH),cush=box(p,uH+uCush);
  bool endRail=a.x-uH.x>a.y-uH.y;
  vec3 cloth=lin(uCloth),alb,n=vec3(0,0,1),P=vec3(p,0);
  float fine=1.-smoothstep(.0008,.0028,uPx);
  float nap=.99+.02*noise(p*550.);
  float weave=1.+.018*fine*sin(p.x*3600.)*sin(p.y*3600.);
  cloth*=nap*weave;
  float sheen=0.;

  if(play<0.){
    float edge=max(0.,min(uH.x-a.x,uH.y-a.y));
    // Local occlusion under the cushion nose, then a much broader soft falloff.
    float shadow=1.-.30*exp(-edge/.009)-.075*exp(-edge/.055);
    alb=cloth*shadow;
    float spot=min(length(p),min(length(p-vec2(uH.x*.5,0)),length(p+vec2(uH.x*.5,0))));
    float line=abs(p.x+uH.x*.5)-.00055;
    alb=mix(alb,vec3(.53,.55,.47),cover(spot-.004)*.82);
    alb=mix(alb,vec3(.42,.46,.37),cover(line)*.22);
    // Directional cloth nap subtly catches the overhead light without looking like a flat gradient.
    sheen=.003*pow(max(0.,1.-abs(p.y)/uH.y),3.);
  }else if(cush<0.){
    float t=clamp(endRail?(a.x-uH.x)/uCush:(a.y-uH.y)/uCush,0.,1.);
    vec2 inward=endRail?vec2(-sign(p.x),0):vec2(0,-sign(p.y));
    n=normalize(vec3(inward*(.85-.74*t),1));P.z=.032;
    alb=cloth*(.77+.14*sin(t*3.14));
    alb*=1.-.20*exp(-t*32.);
    alb+=cloth*.035*exp(-pow((t-.62)/.23,2.));
    // Fine stitched join where the cloth disappears under the polished rail.
    alb*=1.-.16*cover(abs(t-.94)*uCush-.0007);
  }else{
    float e=max(0.,-outer);
    vec2 outward=endRail?vec2(sign(p.x),0):vec2(0,sign(p.y));
    n=normalize(vec3(outward*(1.-smoothstep(0.,.016,e))*.8,1));P.z=.048;
    float along=endRail?p.y:p.x,across=endRail?p.x:p.y;
    float bend=noise(vec2(along*2.4,across*14.))*8.;
    float fibre=sin(across*720.+bend)*.035*fine;
    float growth=noise(vec2(along*3.,across*130.))-.5;
    float grain=1.+growth*.28+fibre;
    alb=lin(uRailC)*grain;
    float inner=max(0.,cush),railT=inner/max(uRail-uCush,.001);
    // Satin walnut with a dark rolled edge and recessed inner moulding.
    alb*=.68+.32*smoothstep(0.,.012,e);
    alb*=1.-.17*exp(-inner/.005);
    float routing=cover(abs(e-.009)-.00065);
    alb=mix(alb,lin(uRailC)*.43,routing*.65);
    sheen=.009*exp(-pow((railT-.47)/.28,2.));
    // Ivory diamond inlays with analytic coverage and a fine recessed border.
    vec2 sp=endRail?vec2(a.x-uH.x-(uRail+uCush)*.5,mod(p.y+uH.y*.5,uH.y*.5)-uH.y*.25):vec2(mod(p.x+uH.x*.25,uH.x*.25)-uH.x*.125,a.y-uH.y-(uRail+uCush)*.5);
    vec2 dd=abs(endRail?sp.yx:sp);
    float dm=(dd.x/.010+dd.y/.0046-1.)*.0046;
    alb=mix(alb,vec3(.025,.024,.018),cover(dm-.0007));
    alb=mix(alb,lin(uSight)*(.83+.13*sin(along*30.)),cover(dm));
  }

  vec3 col=alb*(.09+.91*irr(P,n))+vec3(sheen);
  // The open throat is a recessed facing, not an outlined rectangular slot.
  // Only the circular drop has a raised leather collar; this avoids keyhole-shaped pockets.
  float facing=1.-smoothstep(-.024,.006,throat);
  col=mix(col,vec3(.006,.008,.006),facing*.86);
  // Rounded black-leather facings. The lining is distinct from the unlit cavity.
  float collar=cover(opening-.008)*(1.-facing*.35);
  float leatherNoise=.88+.12*noise(p*950.);
  vec3 leather=vec3(.014,.015,.012)*leatherNoise;
  float rim=exp(-pow((opening-.0035)/.0024,2.));
  leather+=vec3(.013,.014,.010)*rim;
  col=mix(col,leather,collar);
  float stitchLine=cover(abs(hole-.009)-.00055);
  float stitchDash=smoothstep(.35,.65,sin(angle*66.));
  col=mix(col,vec3(.038,.038,.027),stitchLine*stitchDash*.35*(1.-cover(throat-.002)));
  vec3 cavity=vec3(.0012,.0016,.0013)+vec3(.002,.0025,.0018)*exp(min(opening,0.)/.012);
  col=mix(col,cavity,cover(opening));
  col=mix(col,floorCol(p),smoothstep(-uPx,uPx,outer));
  o=vec4(srgb(grade(col)),1);
}`;
