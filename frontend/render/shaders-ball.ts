import { COMMON } from "./shaders.ts";

export const BALL_VS = `#version 300 es
in vec2 aQ;in vec2 aC;in float aId;in vec3 aR0;in vec3 aR1;in vec3 aR2;
uniform mat3 uClip;uniform float uR,uScale;
out vec2 vQ;out vec2 vC;flat out int vId;out vec3 r0;out vec3 r1;out vec3 r2;
void main(){vQ=aQ*uScale;vC=aC;vId=int(aId+.5);r0=aR0;r1=aR1;r2=aR2;
gl_Position=vec4((uClip*vec3(aC+vQ*uR,1)).xy,0,1);}`;

export const BALL_FS = COMMON + `
in vec2 vQ;in vec2 vC;flat in int vId;in vec3 r0;in vec3 r1;in vec3 r2;out vec4 o;
uniform float uR,uPx;uniform vec3 uCol[16];uniform vec3 uCloth;uniform sampler2D uAtlas;
const vec3 IVORY=vec3(.80,.78,.70);
void main(){
  float d=length(vQ);float al=1.-smoothstep(1.-uPx/uR,1.+uPx/uR,d);if(al<=0.)discard;
  vec3 n=vec3(vQ,sqrt(max(0.,1.-d*d)));
  vec3 l=transpose(mat3(r0,r1,r2))*n;
  vec3 alb;
  if(vId==0){alb=IVORY;float m=max(abs(l.x),max(abs(l.y),abs(l.z)));if(m>.982)alb=vec3(.55,.03,.03);}
  else{
    vec3 base=lin(uCol[vId]);
    alb=vId>8?(abs(l.z)<.56?base:IVORY):base;
    if(abs(l.x)>.9){
      vec2 uv=vec2(l.y*sign(l.x),l.z)/.436*.5+.5;
      int c=vId-1;vec2 cell=(vec2(c%4,3-c/4)+clamp(uv,0.,1.))/4.;
      alb=mix(IVORY,vec3(.012),texture(uAtlas,cell).r);
    }
  }
  vec3 P=vec3(vC,uR)+n*uR,V=vec3(0,0,1),col=vec3(0);
  const float A2=.0144;const float F0=.045;
  for(int i=0;i<2;i++){
    vec3 Ld=uLamp[i]-P;float r2=dot(Ld,Ld);vec3 L=Ld*inversesqrt(r2);
    float nl=max(dot(n,L),0.),nv=max(n.z,1e-3);vec3 H=normalize(L+V);float nh=max(dot(n,H),0.);
    float D=A2/(3.14159*pow(nh*nh*(A2-1.)+1.,2.));
    float k=A2*.5;float Gs=(nl/(nl*(1.-k)+k))*(nv/(nv*(1.-k)+k));
    float F=F0+(1.-F0)*pow(1.-max(dot(H,V),0.),5.);
    float E=inversesqrt(r2)/r2/uE0;
    col+=(alb*(1.-F)*nl+vec3(D*F*Gs/(4.*nv+1e-4)))*E;
  }
  col+=alb*(.06+.22*lin(uCloth)*(1.-n.z));
  float rz=2.*n.z*n.z-1.;float Fr=F0+(1.-F0)*pow(1.-n.z,5.);
  col+=Fr*lin(uCloth)*.85*smoothstep(0.,-.35,rz);
  o=vec4(srgb(grade(col)),al);
}`;

export const SHADOW_FS = COMMON + `
in vec2 vQ;in vec2 vC;out vec4 o;
uniform float uR;
void main(){
  vec2 p=vC+vQ*uR;float f=1.;
  for(int i=0;i<2;i++){
    vec3 L=uLamp[i];float k=uR/(L.z-uR);vec2 sc=vC+(vC-L.xy)*k;float sr=uR*L.z/(L.z-uR);
    float pen=.14*uR/(L.z-uR)*L.z+.004;
    f-=.40*(1.-smoothstep(sr-pen,sr+pen,length(p-sc)));
  }
  float c=length(p-vC)/uR;f-=.22*exp(-c*c*2.5);
  o=vec4(vec3(max(f,0.)),1);
}`;
