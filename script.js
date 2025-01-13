/*********
 * made by Matthias Hurrle (@atzedent)
 */

/** @type {HTMLCanvasElement} */
const canvas = window.canvas;
const gl = canvas.getContext("webgl2");
const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
/** @type {Map<string,PointerEvent>} */
const touches = new Map(); 

const vertexSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

in vec2 position;

void main(void) {
    gl_Position = vec4(position, 0., 1.);
}
`;

const fragmentSource = `#version 300 es
/*********
* made by Matthias Hurrle (@atzedent)
*/

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float time;
uniform vec2 resolution;
uniform vec2 touch;
uniform int pointerCount;

out vec4 fragColor;

#define PI 3.14159
#define TAU 6.28318
#define T (mod(time,90.)*.45)
#define S smoothstep
#define mouse (touch/resolution)
#define hue(a) (.5+.2*cos(10.3*(a)+vec3(0,23,21)))
#define rot(a) mat2(cos(a),-sin(a),sin(a),cos(a))
#define syl(p,r) (length(p)-r)

float tick(float t, float e) {
  return floor(t)+pow(S(.0, 1.,fract(t)), e);
}

float box(vec3 p, vec3 s, float r) {
  p = abs(p)-s;

  return length(max(p,.0))+ 
    min(.0, max(max(p.x, p.y), p.z))-r;
}

float map(vec3 p) {
  const float n = 5.5;
  p.yz = (fract(p.yz/n)-.5)*n;
  p.xz = (p.xz-n*clamp(round(p.xz/n), -10.,10.));
  p.yz *= rot(sin(tick(T, 1.)));
  p.xz *= rot(sin(tick(T, 1.)));
  float d = 1e5,
  bx = box(p, vec3(.85),.125);

  d = min(d, bx);

  return d;
}

vec3 norm(vec3 p) {
  vec2 e = vec2(1e-2, 0);
  float d = map(p);
  vec3 n = d-vec3(
    map(p-e.xyy),
    map(p-e.yxy),
    map(p-e.yyx)
  );

  return normalize(n);
}

vec3 dir(vec2 uv, vec3 ro, vec3 t, float z) {
  vec3 up = vec3(0, 1, 0),
  f = normalize(t-ro),
  r = normalize(cross(up, f)),
  u = cross(f, r),
  c = f*z,
  i = c+uv.x*r+uv.y*u,
  d = normalize(i);

  return d;
}

void cam(inout vec3 p) {
  if (pointerCount == 0) {
    p.xy *= rot(cos(T*.2)*PI);
  }
}

void cam2(inout vec3 p) {
  if (pointerCount > 0) {
    p.yz *= rot(-mouse.y*acos(-1.)+acos(.0));
    p.xz *= rot(-mouse.x*acos(-1.)*2.);
  } else {
    p.xz *= rot(sin(T*.2)*PI);
  }
}

void main(void) {
  vec2 uv = (
    gl_FragCoord.xy-.5*resolution
  )/min(resolution.x, resolution.y);

  vec3 col = vec3(0),
  tg = vec3(0, 0, T*10.),
  ro = vec3(0, 0, tg.z-20.),
  rd = dir(uv, ro, tg, 1.);

  cam(ro);
  cam(rd);
  cam2(rd);

  vec3
  l = normalize(ro-vec3(1, 2, 3)),
  p = ro;

  const float steps = 90., maxd = 30.;

  float i = .0,
  dd = .0,
  side = 1., e = 1.;

  for (; i < steps; i++) {
    float d = map(p)*side;

    if (d < 1e-3) {
      vec3 n = norm(p) * side;
      float fog = 1. - clamp(dd / maxd, .0, 1.),
      diff = max(.0, dot(normalize(ro - p), n)),
      fres = clamp(dot(-rd, n), .0, 1.);

      vec3 h = normalize(l - rd);
      col += e
      * (1. - max(.0, i / 200.))
      * diff
      * (
        5. * pow(max(.0, dot(n, h)), 64.) +
        .5 * pow(max(.0, fres), 32.)
      )
      * hue(diff);

      side = -side;
      vec3 rdo = refract(rd, n, 1. + side * .45);

      if (dot(rdo, rdo) == .0) {
        rdo = reflect(rd, n);
      }

      rd = rdo;
      d = 9e-2;
      e *= .925;
    }
    if (dd > maxd) {
      dd = maxd;
      break;
    }

    p += rd * d;
    dd += d;
  }

  p = ro+rd*maxd;

  fragColor = vec4(col*2., 1);
}
`;

let time;
let buffer;
let program;
let touch;
let resolution;
let pointerCount;
let vertices = [];
let touching = false;

function resize() {
  const { innerWidth: width, innerHeight: height } = window;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  gl.viewport(0, 0, width * dpr, height * dpr);
}

function compile(shader, source) {
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
  }
}

function setup() {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);

  program = gl.createProgram();

  compile(vs, vertexSource);
  compile(fs, fragmentSource);

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }

  vertices = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0];

  buffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, "position");

  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  time = gl.getUniformLocation(program, "time");
  touch = gl.getUniformLocation(program, "touch");
  pointerCount = gl.getUniformLocation(program, "pointerCount");
  resolution = gl.getUniformLocation(program, "resolution");
}

function draw(now) {
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  gl.uniform1f(time, now * 0.001);
  gl.uniform2f(touch, ...getTouches());
  gl.uniform1i(pointerCount, touches.size);
  gl.uniform2f(resolution, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length * 0.5);
}

function getTouches() {
  if (!touches.size) {
    return [0, 0];
  }

  for (let [id, t] of touches) {
    const result = [dpr * t.clientX, dpr * (innerHeight - t.clientY)];
    return result;
  }
}

function loop(now) {
  draw(now);
  requestAnimationFrame(loop);
}

function init() {
  setup();
  resize();
  loop(0);
}

document.body.onload = init;
window.onresize = resize;
canvas.onpointerdown = (e) => {
  touching = true;
  touches.set(e.pointerId, e);
};
canvas.onpointermove = (e) => {
  if (!touching) return;
  touches.set(e.pointerId, e);
};
canvas.onpointerup = (e) => {
  touching = false;
  touches.clear();
};
canvas.onpointerout = (e) => {
  touching = false;
  touches.clear();
};
