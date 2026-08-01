// components/GlitchVisualizer.tsx
// Uses useAudioAnalyzer; injects band uniforms directly into WebGL at 60fps.
// Zero React state in the hot path — all uniform writes go through gl refs.

'use client'; // Next.js App Router directive

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useAudioAnalyzer, AudioAnalyzerHandle } from '@/hooks/useAudioAnalyzer';

// ── Fragment Shader ────────────────────────────────────────────────────────
const FRAG_SHADER = `
  precision highp float;

  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_high;
  uniform vec2  u_resolution;
  uniform float u_glitch_mult;
  uniform int   u_color_mode; // 0=default, 1=cyberpunk, 2=toxic, 3=monochrome, 4=gold

  // ── Utility ─────────────────────────────────────────────────────────────
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(rand(i), rand(i + vec2(1.0, 0.0)), f.x),
      mix(rand(i + vec2(0.0, 1.0)), rand(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  // ── Glitch block displacement ────────────────────────────────────────────
  vec2 glitchUV(vec2 uv, float intensity) {
    float slice     = floor(uv.y * 20.0) / 20.0;
    float offset    = (rand(vec2(slice, u_time * 30.0)) - 0.5)
                      * intensity * u_bass * u_glitch_mult;
    float scanline  = step(0.995, fract(uv.y * 80.0 + u_time * 0.3));
    offset         += scanline * intensity * 0.5 * u_mid * u_glitch_mult;
    return vec2(uv.x + offset, uv.y);
  }

  // ── RGB channel split driven by mid ─────────────────────────────────────
  vec3 chromaShift(vec2 uv) {
    float shift = u_mid * 0.03 * u_glitch_mult;
    float r = noise(uv * 4.0 + vec2(u_time * 0.7 + shift, 0.0));
    float g = noise(uv * 4.0 + vec2(u_time * 0.7,          0.0));
    float b = noise(uv * 4.0 + vec2(u_time * 0.7 - shift, 0.0));

    if (u_color_mode == 1) { // Cyberpunk Neon
      return vec3(r * 1.3, g * 0.2, b * 1.4);
    } else if (u_color_mode == 2) { // Toxic Matrix
      return vec3(r * 0.1, g * 1.4, b * 0.4);
    } else if (u_color_mode == 3) { // Monochrome
      float l = (r + g + b) / 3.0;
      return vec3(l, l, l);
    } else if (u_color_mode == 4) { // Gold Sovereign
      return vec3(r * 1.4, g * 0.85, b * 0.15);
    }
    return vec3(r, g, b);
  }

  // ── High-frequency shimmer ───────────────────────────────────────────────
  float shimmer(vec2 uv) {
    float grid  = step(0.97, fract(uv.x * 60.0)) +
                  step(0.97, fract(uv.y * 60.0));
    float flash = rand(vec2(floor(uv.x * 60.0),
                            floor(uv.y * 60.0) + u_time * 60.0));
    return grid * flash * u_high * 2.0;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Distort UV with glitch displacement
    vec2 gUV     = glitchUV(uv, 0.08);

    // Base color field from chroma shift
    vec3 color   = chromaShift(gUV);

    // Bass pulse: radial bloom from center
    float dist   = length(uv - 0.5);
    float pulse  = smoothstep(0.6, 0.0, dist) * u_bass * 1.5;

    if (u_color_mode == 1) {
      color += vec3(pulse * 0.8, pulse * 0.1, pulse * 0.9);
    } else if (u_color_mode == 2) {
      color += vec3(pulse * 0.1, pulse * 0.9, pulse * 0.2);
    } else if (u_color_mode == 4) {
      color += vec3(pulse * 1.0, pulse * 0.7, pulse * 0.1);
    } else {
      color += vec3(pulse * 0.4, pulse * 0.1, pulse * 0.6);
    }

    // Mid: horizontal scan streak
    float streak = step(0.99, fract(uv.y + u_time * 0.2)) * u_mid;
    color       += vec3(0.0, streak, streak * 0.5);

    // High: grid shimmer overlay
    color       += shimmer(uv);

    // Vignette
    float vig    = 1.0 - smoothstep(0.3, 0.9, dist);
    color       *= vig;

    // Gamma
    color        = pow(clamp(color, 0.0, 1.0), vec3(0.454545));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const VERT_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// ── Helper: compile shader ─────────────────────────────────────────────────
function compileShader(gl: WebGLRenderingContext, src: string, type: number): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

// ── Component ─────────────────────────────────────────────────────────────
export interface GlitchVisualizerProps {
  audioEl?: HTMLAudioElement | null;
  analyzerHandle?: AudioAnalyzerHandle | null;
  width?: number;
  height?: number;
  glitchMultiplier?: number;
  colorMode?: 0 | 1 | 2 | 3 | 4; // 0=Default, 1=Cyberpunk, 2=Toxic, 3=Monochrome, 4=Gold
  sensitivity?: number;
  style?: React.CSSProperties;
  className?: string;
}

export interface GlitchVisualizerHandle {
  getCanvas: () => HTMLCanvasElement | null;
  takeSnapshot: () => string | null;
}

const GlitchVisualizer = forwardRef<GlitchVisualizerHandle, GlitchVisualizerProps>(({
  audioEl,
  analyzerHandle: externalAnalyzer,
  width  = 800,
  height = 450,
  glitchMultiplier = 1.0,
  colorMode = 0,
  sensitivity = 1.0,
  style,
  className = '',
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef     = useRef<WebGLRenderingContext | null>(null);
  const progRef   = useRef<WebGLProgram | null>(null);
  const rafRef    = useRef<number>(0);
  const startRef  = useRef<number>(0);

  // Use internal analyzer if external is not passed
  const internalAnalyzer = useAudioAnalyzer({ fftSize: 2048, smoothingTimeConstant: 0.8 });
  const activeAnalyzer   = externalAnalyzer || internalAnalyzer;

  // Store options in refs so render loop accesses them without recreation
  const glitchMultRef  = useRef(glitchMultiplier);
  const colorModeRef   = useRef(colorMode);
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => { glitchMultRef.current = glitchMultiplier; }, [glitchMultiplier]);
  useEffect(() => { colorModeRef.current = colorMode; }, [colorMode]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);

  // ── Uniform location cache — never query inside the RAF loop ──────────────
  const uniRef = useRef<{
    time:       WebGLUniformLocation | null;
    bass:       WebGLUniformLocation | null;
    mid:        WebGLUniformLocation | null;
    high:       WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    glitchMult: WebGLUniformLocation | null;
    colorMode:  WebGLUniformLocation | null;
  }>({ time: null, bass: null, mid: null, high: null, resolution: null, glitchMult: null, colorMode: null });

  // ── Wire audio when element is provided ───────────────────────────────────
  useEffect(() => {
    if (audioEl && activeAnalyzer && !externalAnalyzer) {
      activeAnalyzer.connect(audioEl);
    }
  }, [audioEl, activeAnalyzer, externalAnalyzer]);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    takeSnapshot: () => {
      if (!canvasRef.current) return null;
      try {
        return canvasRef.current.toDataURL('image/png');
      } catch (e) {
        console.error('Failed snapshot', e);
        return null;
      }
    }
  }));

  // ── WebGL init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext('webgl', { preserveDrawingBuffer: true }) ?? 
                canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true })) as WebGLRenderingContext | null;
    if (!gl) { console.error('WebGL not supported'); return; }
    glRef.current = gl;

    let vert: WebGLShader;
    let frag: WebGLShader;
    let prog: WebGLProgram;

    try {
      vert = compileShader(gl, VERT_SHADER, gl.VERTEX_SHADER);
      frag = compileShader(gl, FRAG_SHADER, gl.FRAGMENT_SHADER);

      prog = gl.createProgram()!;
      gl.attachShader(prog, vert);
      gl.attachShader(prog, frag);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
      }
      gl.useProgram(prog);
      progRef.current = prog;
    } catch (err) {
      console.error('WebGL initialization failed:', err);
      return;
    }

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations once
    uniRef.current = {
      time:       gl.getUniformLocation(prog, 'u_time'),
      bass:       gl.getUniformLocation(prog, 'u_bass'),
      mid:        gl.getUniformLocation(prog, 'u_mid'),
      high:       gl.getUniformLocation(prog, 'u_high'),
      resolution: gl.getUniformLocation(prog, 'u_resolution'),
      glitchMult: gl.getUniformLocation(prog, 'u_glitch_mult'),
      colorMode:  gl.getUniformLocation(prog, 'u_color_mode'),
    };

    gl.uniform2f(uniRef.current.resolution, canvas.width, canvas.height);

    startRef.current = performance.now();

    // ── 60fps render loop — all uniform writes, zero React state ────────────
    const render = () => {
      if (!glRef.current || !progRef.current) return;
      const glCtx = glRef.current;
      const t  = (performance.now() - startRef.current) / 1000;
      const bands = activeAnalyzer.getBands(); // synchronous mutable read
      const sens = sensitivityRef.current;

      glCtx.viewport(0, 0, canvas.width, canvas.height);
      glCtx.uniform1f(uniRef.current.time!, t);
      glCtx.uniform1f(uniRef.current.bass!, Math.min(1.0, bands.bass * sens));
      glCtx.uniform1f(uniRef.current.mid!,  Math.min(1.0, bands.mid * sens));
      glCtx.uniform1f(uniRef.current.high!, Math.min(1.0, bands.high * sens));
      glCtx.uniform1f(uniRef.current.glitchMult!, glitchMultRef.current);
      glCtx.uniform1i(uniRef.current.colorMode!, colorModeRef.current);

      glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (glRef.current && progRef.current) {
        glRef.current.deleteProgram(progRef.current);
      }
      if (glRef.current && buf) {
        glRef.current.deleteBuffer(buf);
      }
      if (!externalAnalyzer) {
        internalAnalyzer.dispose();
      }
    };
  }, [activeAnalyzer, externalAnalyzer, internalAnalyzer]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`block w-full h-auto rounded-lg overflow-hidden shadow-2xl ${className}`}
      style={{
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
});

GlitchVisualizer.displayName = 'GlitchVisualizer';

export default GlitchVisualizer;
