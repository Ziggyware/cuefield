/**
 * Shared: two pendant lamps (point sources, inverse-square · cosine), linear-light shading, sRGB encode.
 * grade: exposure, saturation about Rec.709 luminance, contrast pivoting on 18% grey, C¹ shoulder above 0.8.
 */
export const COMMON = `#version 300 es
precision highp float;
uniform vec3 uLamp[2];
uniform float uE0;
uniform vec3 uGrade;
vec3 grade(vec3 c){c*=uGrade.x;float l=dot(c,vec3(.2126,.7152,.0722));c=max(mix(vec3(l),c,uGrade.y),0.);c=.18*pow(c/.18,vec3(uGrade.z));return mix(c,.8+.2*(1.-exp(-(c-.8)/.2)),step(.8,c));}
vec3 srgb(vec3 c){c=clamp(c,0.,1.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
vec3 lin(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
float irr(vec3 p,vec3 n){float e=0.;for(int i=0;i<2;i++){vec3 d=uLamp[i]-p;float r2=dot(d,d);e+=max(dot(n,d),0.)*inversesqrt(r2)/r2;}return e/uE0;}
`;

export const QUAD_VS = `#version 300 es
in vec2 aP;
uniform mat3 uClip;
out vec2 vP;
void main(){vP=aP;gl_Position=vec4((uClip*vec3(aP,1)).xy,0,1);}`;
