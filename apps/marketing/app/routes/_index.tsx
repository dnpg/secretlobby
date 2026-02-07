import { Form, useActionData, useNavigation, useLoaderData, redirect } from "react-router";
import type { Route } from "./+types/_index";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { getLocaleFromRequest, type Locale, locales, isValidLocale, defaultLocale } from "~/i18n";

export function meta({ data }: Route.MetaArgs) {
  const t = data?.t;
  return [
    { title: t?.meta.title || "SecretLobby - Private Music Sharing for Artists" },
    { name: "description", content: t?.meta.description || "Share your unreleased music privately with record labels." },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getTranslations } = await import("~/i18n");

  const consoleUrl = process.env.CONSOLE_URL || "//app.secretlobby.local";

  // Check if locale is in URL params (e.g., /es)
  const urlLocale = params.locale;

  let locale: Locale;

  if (urlLocale) {
    // URL has a locale param - validate it
    if (!isValidLocale(urlLocale)) {
      // Invalid locale - redirect to root
      throw redirect("/");
    }
    locale = urlLocale;
  } else {
    // No locale in URL - detect from request (cookies, Accept-Language header)
    locale = getLocaleFromRequest(request);
  }

  const t = getTranslations(locale);

  return { consoleUrl, locale, t };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { prisma } = await import("@secretlobby/db");
  const { checkRateLimit, RATE_LIMIT_CONFIGS, getClientIp } = await import("@secretlobby/auth/rate-limit");
  const { getTranslations } = await import("~/i18n");

  // Get locale from URL params or request
  const urlLocale = params.locale;
  const locale: Locale = urlLocale && isValidLocale(urlLocale) ? urlLocale : getLocaleFromRequest(request);
  const t = getTranslations(locale);

  // Rate limiting
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.INTERESTED_SIGNUP);
  if (!rateLimitResult.allowed) {
    return { error: t.errors.tooManyRequests };
  }

  const formData = await request.formData();
  const email = formData.get("email");
  const source = formData.get("source") || "marketing-hero";

  if (typeof email !== "string" || !email.trim()) {
    return { error: t.errors.emailRequired };
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: t.errors.invalidEmail };
  }

  try {
    // Check if already exists
    const existing = await prisma.interestedPerson.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return { success: true, message: t.modal.alreadyRegistered };
    }

    // Create new interested person
    await prisma.interestedPerson.create({
      data: {
        email: email.toLowerCase(),
        source: typeof source === "string" ? source : "marketing-hero",
        ipAddress: getClientIp(request),
        userAgent: request.headers.get("user-agent") || undefined,
      },
    });

    return { success: true, message: t.modal.success };
  } catch (error) {
    console.error("Error creating interested person:", error);
    return { error: t.errors.somethingWrong };
  }
}

// Icons as components
function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function HeadphonesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const featureIcons = [LockIcon, KeyIcon, MusicIcon, BuildingIcon, ShieldIcon, ZapIcon];
const stepIcons = [UploadIcon, LockIcon, ShareIcon, HeadphonesIcon];

// Animated border card component with rotating light effect
function AnimatedBorderCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Random starting angle for each card (set once on mount)
  const [initialAngle] = useState(() => Math.random() * 360);
  const [angle, setAngle] = useState(initialAngle);
  const [isHovered, setIsHovered] = useState(false);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const animate = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      // Speed: normal = 30deg/sec (slow), hovered = 150deg/sec (5x faster)
      const speed = isHovered ? 150 : 30;
      setAngle((prev) => (prev + (delta * speed) / 1000) % 360);

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isHovered]);

  const gradientStyle = {
    background: `conic-gradient(from ${angle}deg, transparent 40%, transparent 60%, #ed1b2f 75%, #ffffff 85%, #ed1b2f 95%, transparent 100%)`,
  };

  return (
    <div
      className={`group relative rounded-xl p-[1px] overflow-hidden cursor-pointer ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated gradient border */}
      <div
        className={`absolute inset-0 rounded-xl transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-40"}`}
        style={gradientStyle}
      />
      {/* Glow effect on hover */}
      <div
        className={`absolute inset-0 rounded-xl blur-md transition-opacity duration-300 ${isHovered ? "opacity-60" : "opacity-0"}`}
        style={gradientStyle}
      />
      {/* Card content */}
      <div className="relative bg-[#1a1a1a] rounded-xl p-6 h-full">
        {children}
      </div>
    </div>
  );
}

// WebGL Shader Background for music-inspired waves
function MusicWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Fragment shader - subtle music waves
    const fragmentShaderSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;

      // Simplex noise function
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                          -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;

        // Dark base color
        vec3 bgColor = vec3(0.059, 0.059, 0.059); // #0f0f0f

        // Create multiple wave layers like sound waves
        float wave1 = sin(uv.x * 8.0 + u_time * 0.3 + snoise(uv * 2.0 + u_time * 0.1) * 2.0) * 0.5 + 0.5;
        float wave2 = sin(uv.x * 12.0 - u_time * 0.2 + snoise(uv * 3.0 - u_time * 0.15) * 1.5) * 0.5 + 0.5;
        float wave3 = sin(uv.x * 6.0 + u_time * 0.4 + snoise(uv * 1.5 + u_time * 0.08) * 3.0) * 0.5 + 0.5;

        // Vertical position for wave bands
        float y = uv.y;

        // Create wave bands at different heights (thicker bands)
        float band1 = smoothstep(0.0, 0.06, abs(y - 0.25 - wave1 * 0.08));
        float band2 = smoothstep(0.0, 0.05, abs(y - 0.5 - wave2 * 0.07));
        float band3 = smoothstep(0.0, 0.07, abs(y - 0.75 - wave3 * 0.09));

        // Noise for organic feel
        float noise = snoise(uv * 4.0 + u_time * 0.05) * 0.5 + 0.5;

        // Red color for waves - more saturated
        vec3 redColor = vec3(0.929, 0.106, 0.184); // #ed1b2f
        vec3 darkRed = vec3(0.5, 0.05, 0.1); // Dark version of #ed1b2f
        vec3 whiteColor = vec3(1.0, 0.9, 0.9); // Slight red tint

        // Combine waves with stronger intensity
        float waveIntensity = (1.0 - band1) * 0.35 + (1.0 - band2) * 0.3 + (1.0 - band3) * 0.25;
        waveIntensity *= noise * 0.6 + 0.4;

        // Add flowing noise pattern
        float flowNoise = snoise(vec2(uv.x * 3.0 + u_time * 0.1, uv.y * 2.0)) * 0.5 + 0.5;
        flowNoise *= snoise(vec2(uv.x * 5.0 - u_time * 0.08, uv.y * 3.0 + u_time * 0.05)) * 0.5 + 0.5;

        // Add a red glow/fog across the canvas
        float redFog = snoise(uv * 2.0 + u_time * 0.03) * 0.5 + 0.5;
        redFog *= 0.15;

        // Mix colors - more red dominant
        vec3 waveColor = mix(redColor, whiteColor, flowNoise * 0.15);
        waveColor = mix(darkRed, waveColor, waveIntensity);
        vec3 finalColor = mix(bgColor, waveColor, waveIntensity * 0.7 + redFog);

        // Subtle vignette
        float vignette = 1.0 - length(uv - 0.5) * 0.2;
        finalColor *= vignette;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    // Compile shaders
    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) return;

    // Create program
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    // Set up geometry (full screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");

    // Handle resize
    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const width = canvas.clientWidth * dpr;
      const height = canvas.clientHeight * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    // Animation loop
    const startTime = performance.now();
    function render() {
      resize();
      if (!gl || !canvas) return;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);

      gl.enableVertexAttribArray(positionLocation);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, (performance.now() - startTime) / 1000);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.85 }}
    />
  );
}

// Logo distortion shader background for hero section - Pond with coins effect
// Fully GPU-based with instanced rendering for maximum performance
function LogoDistortionBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef({
    x: 0.5, y: 0.5,
    isMoving: false,
    speed: 0,
    lastMoveTime: 0
  });
  const rippleTrailRef = useRef<Array<{ x: number; y: number; time: number; strength: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "high-performance" });
    if (!gl) return;

    // Get instancing extension for better performance
    const instExt = gl.getExtension("ANGLE_instanced_arrays");

    // Logo state - stored in typed arrays for GPU upload
    // TWEAK: Number of logos (instanced rendering handles 1000+ easily)
    const NUM_LOGOS = 1000;
    const logoData = new Float32Array(NUM_LOGOS * 6); // x, y, size, rotation, depth, alpha
    const logoVelocity = new Float32Array(NUM_LOGOS * 3); // vx, vy, angularVel
    const logoMass = new Float32Array(NUM_LOGOS);

    // Initialize logos
    for (let i = 0; i < NUM_LOGOS; i++) {
      // Slightly smaller range for more logos
      const size = 0.015 + Math.random() * 0.045;
      const depth = 0.2 + Math.random() * 0.8;
      const idx = i * 6;
      logoData[idx] = Math.random();     // x
      logoData[idx + 1] = Math.random(); // y
      logoData[idx + 2] = size;          // size
      logoData[idx + 3] = Math.random() * Math.PI * 2; // rotation
      logoData[idx + 4] = depth;         // depth
      logoData[idx + 5] = 1.0;           // alpha (no opacity variation)
      logoMass[i] = size * 10;
    }

    // Sort by depth (back to front) - simple insertion sort on indices
    const indices = Array.from({ length: NUM_LOGOS }, (_, i) => i);
    indices.sort((a, b) => logoData[a * 6 + 4] - logoData[b * 6 + 4]);

    // Reorder data by depth
    const sortedData = new Float32Array(NUM_LOGOS * 6);
    const sortedVel = new Float32Array(NUM_LOGOS * 3);
    const sortedMass = new Float32Array(NUM_LOGOS);
    for (let i = 0; i < NUM_LOGOS; i++) {
      const src = indices[i];
      for (let j = 0; j < 6; j++) sortedData[i * 6 + j] = logoData[src * 6 + j];
      for (let j = 0; j < 3; j++) sortedVel[i * 3 + j] = logoVelocity[src * 3 + j];
      sortedMass[i] = logoMass[src];
    }
    logoData.set(sortedData);
    logoVelocity.set(sortedVel);
    logoMass.set(sortedMass);

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const newX = (e.clientX - rect.left) / rect.width;
      const newY = (e.clientY - rect.top) / rect.height;
      const dx = newX - mouseRef.current.x;
      const dy = newY - mouseRef.current.y;
      const speed = Math.sqrt(dx * dx + dy * dy);

      if (speed > 0.002) {
        rippleTrailRef.current.push({
          x: newX, y: newY,
          time: performance.now(),
          strength: Math.min(1.0, speed * 15)
        });
        if (rippleTrailRef.current.length > 20) rippleTrailRef.current.shift();
      }

      mouseRef.current.speed = speed;
      mouseRef.current.x = newX;
      mouseRef.current.y = newY;
      mouseRef.current.isMoving = true;
      mouseRef.current.lastMoveTime = performance.now();
    };
    canvas.addEventListener("mousemove", handleMouseMove);

    const MAX_TRAIL_POINTS = 12;

    // ============ LOGO SHADER (GPU instanced rendering) ============
    const logoVS = `
      attribute vec2 a_quad;
      attribute vec4 a_instanceA; // x, y, size, rotation
      attribute vec2 a_instanceB; // depth, alpha
      uniform vec2 u_resolution;
      uniform float u_time;
      varying vec2 v_uv;
      varying float v_alpha;
      varying float v_depth;

      void main() {
        float size = a_instanceA.z;
        float rotation = a_instanceA.w;
        vec2 pos = a_instanceA.xy;

        // Rotate quad
        float c = cos(rotation);
        float s = sin(rotation);
        vec2 rotated = vec2(
          a_quad.x * c - a_quad.y * s,
          a_quad.x * s + a_quad.y * c
        );

        // Scale and position
        float aspect = u_resolution.x / u_resolution.y;
        vec2 scaled = rotated * size;
        scaled.x /= aspect;

        // Convert to clip space (-1 to 1), Y flipped for screen coords
        vec2 clipPos = (pos + scaled) * 2.0 - 1.0;
        clipPos.y = -clipPos.y;

        gl_Position = vec4(clipPos, a_instanceB.x * 0.001, 1.0); // depth for z-ordering
        v_uv = a_quad + 0.5;
        v_alpha = a_instanceB.y;
        v_depth = a_instanceB.x;
      }
    `;

    const logoFS = `
      precision mediump float;
      uniform sampler2D u_logoTex;
      varying vec2 v_uv;
      varying float v_alpha;
      varying float v_depth;

      void main() {
        vec4 texColor = texture2D(u_logoTex, v_uv);
        // Red tint based on depth
        float redTint = 0.45 - v_depth * 0.35;
        vec3 tinted = mix(texColor.rgb, vec3(0.929, 0.106, 0.184), redTint * texColor.a);
        gl_FragColor = vec4(tinted, texColor.a * v_alpha);
      }
    `;

    // ============ WATER SHADER (post-process) ============
    const waterVS = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_uv = a_position * 0.5 + 0.5;
      }
    `;

    const waterFS = `
      precision highp float;
      uniform sampler2D u_scene;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_rippleStrength;
      uniform vec2 u_resolution;
      uniform vec4 u_trail[${MAX_TRAIL_POINTS}];
      uniform int u_trailCount;
      varying vec2 v_uv;

      vec3 calcRipple(vec2 uv, vec2 ripplePos, float strength, float age, float aspect, float time) {
        vec2 diff = uv - ripplePos;
        diff.x *= aspect;
        float dist = length(diff);
        vec2 dir = normalize(diff + 0.0001);
        float expandRadius = age * 0.4;
        float ringWidth = 0.06;
        float ring = smoothstep(ringWidth, 0.0, abs(dist - expandRadius));
        float centerRipple = smoothstep(0.15, 0.0, dist) * max(0.0, 1.0 - age * 2.0);
        float intensity = (ring + centerRipple) * strength * max(0.0, 1.0 - age * 0.5);
        float waveFreq = 40.0;
        float phase = dist * waveFreq - time * 4.0 - age * 10.0;
        float wave = sin(phase) * exp(-dist * 4.0) * intensity;
        float slope = cos(phase) * waveFreq * exp(-dist * 4.0) * intensity;
        return vec3(dir * slope * 0.004, wave);
      }

      void main() {
        vec2 uv = v_uv;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 totalRefract = vec2(0.0);
        float totalWave = 0.0;
        float totalIntensity = 0.0;

        // Trail ripples
        for (int i = 0; i < ${MAX_TRAIL_POINTS}; i++) {
          if (i >= u_trailCount) break;
          vec4 t = u_trail[i];
          if (t.z > 0.01) {
            vec3 r = calcRipple(uv, t.xy, t.z, t.w, aspect, u_time);
            totalRefract += r.xy;
            totalWave += r.z;
            totalIntensity += t.z * max(0.0, 1.0 - t.w);
          }
        }

        // Current mouse ripple
        if (u_rippleStrength > 0.01) {
          vec2 diff = uv - u_mouse;
          diff.x *= aspect;
          float dist = length(diff);
          vec2 dir = normalize(diff + 0.0001);
          float inZone = smoothstep(0.18, 0.0, dist);
          inZone *= inZone;
          float waveFreq = 50.0;
          float phase = dist * waveFreq - u_time * 4.0;
          float wave = sin(phase) * exp(-dist * 5.0);
          float wave2 = sin(phase * 1.6 + 0.8) * 0.5 * exp(-dist * 7.0);
          totalWave += (wave + wave2) * inZone * u_rippleStrength;
          float slope = cos(phase) * waveFreq * exp(-dist * 5.0);
          slope += cos(phase * 1.6 + 0.8) * waveFreq * 0.8 * exp(-dist * 7.0);
          totalRefract += dir * slope * 0.005 * inZone * u_rippleStrength;
          totalIntensity += u_rippleStrength * inZone;
        }

        // Sample scene with refraction
        vec4 sceneColor = texture2D(u_scene, uv + totalRefract);

        // Chromatic aberration
        float aberr = abs(totalWave) * 0.004;
        sceneColor.r = mix(sceneColor.r, texture2D(u_scene, uv + totalRefract + vec2(aberr, 0.0)).r, min(1.0, totalIntensity) * 0.4);
        sceneColor.b = mix(sceneColor.b, texture2D(u_scene, uv + totalRefract - vec2(aberr, 0.0)).b, min(1.0, totalIntensity) * 0.4);

        // Dark water background
        vec3 water = vec3(0.006, 0.006, 0.01);
        vec3 color = mix(water, sceneColor.rgb, sceneColor.a + 0.05);

        // Highlights
        color += vec3(0.95, 0.97, 1.0) * max(0.0, totalWave) * 0.25;

        // Vignette
        float vig = 1.0 - length(uv - 0.5) * 0.5;
        color *= vig * vig;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Compile shaders
    function compile(glCtx: WebGLRenderingContext, src: string, type: number) {
      const s = glCtx.createShader(type);
      if (!s) return null;
      glCtx.shaderSource(s, src);
      glCtx.compileShader(s);
      if (!glCtx.getShaderParameter(s, glCtx.COMPILE_STATUS)) {
        console.error(glCtx.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    function link(glCtx: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
      const p = glCtx.createProgram();
      if (!p) return null;
      glCtx.attachShader(p, vs);
      glCtx.attachShader(p, fs);
      glCtx.linkProgram(p);
      if (!glCtx.getProgramParameter(p, glCtx.LINK_STATUS)) {
        console.error(glCtx.getProgramInfoLog(p));
        return null;
      }
      return p;
    }

    const logoVSc = compile(gl, logoVS, gl.VERTEX_SHADER);
    const logoFSc = compile(gl, logoFS, gl.FRAGMENT_SHADER);
    const waterVSc = compile(gl, waterVS, gl.VERTEX_SHADER);
    const waterFSc = compile(gl, waterFS, gl.FRAGMENT_SHADER);
    if (!logoVSc || !logoFSc || !waterVSc || !waterFSc) return;

    const logoProgram = link(gl, logoVSc, logoFSc);
    const waterProgram = link(gl, waterVSc, waterFSc);
    if (!logoProgram || !waterProgram) return;

    // Quad vertices (for each logo instance)
    const quadVerts = new Float32Array([
      -0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
      -0.5, 0.5, 0.5, -0.5, 0.5, 0.5
    ]);
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // Instance data buffers
    const instanceBufferA = gl.createBuffer(); // x, y, size, rotation
    const instanceBufferB = gl.createBuffer(); // depth, alpha

    // Full screen quad for water pass
    const fsQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    // Logo uniform/attribute locations
    const logo_a_quad = gl.getAttribLocation(logoProgram, "a_quad");
    const logo_a_instA = gl.getAttribLocation(logoProgram, "a_instanceA");
    const logo_a_instB = gl.getAttribLocation(logoProgram, "a_instanceB");
    const logo_u_res = gl.getUniformLocation(logoProgram, "u_resolution");
    const logo_u_time = gl.getUniformLocation(logoProgram, "u_time");
    const logo_u_tex = gl.getUniformLocation(logoProgram, "u_logoTex");

    // Water uniform locations
    const water_a_pos = gl.getAttribLocation(waterProgram, "a_position");
    const water_u_scene = gl.getUniformLocation(waterProgram, "u_scene");
    const water_u_time = gl.getUniformLocation(waterProgram, "u_time");
    const water_u_mouse = gl.getUniformLocation(waterProgram, "u_mouse");
    const water_u_ripple = gl.getUniformLocation(waterProgram, "u_rippleStrength");
    const water_u_res = gl.getUniformLocation(waterProgram, "u_resolution");
    const water_u_trail = gl.getUniformLocation(waterProgram, "u_trail");
    const water_u_trailCount = gl.getUniformLocation(waterProgram, "u_trailCount");

    // Load logo texture
    const logoTex = gl.createTexture();
    const logoImg = new Image();
    logoImg.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, logoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, logoImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    logoImg.src = "/secret-lobby-logo.svg";

    // Framebuffer for render-to-texture
    let sceneFBO: WebGLFramebuffer | null = null;
    let sceneTex: WebGLTexture | null = null;
    let fboWidth = 0, fboHeight = 0;

    function setupFBO(glCtx: WebGLRenderingContext, w: number, h: number) {
      if (sceneFBO && fboWidth === w && fboHeight === h) return;
      if (sceneFBO) {
        glCtx.deleteFramebuffer(sceneFBO);
        glCtx.deleteTexture(sceneTex);
      }
      fboWidth = w;
      fboHeight = h;
      sceneTex = glCtx.createTexture();
      glCtx.bindTexture(glCtx.TEXTURE_2D, sceneTex);
      glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, w, h, 0, glCtx.RGBA, glCtx.UNSIGNED_BYTE, null);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
      sceneFBO = glCtx.createFramebuffer();
      glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, sceneFBO);
      glCtx.framebufferTexture2D(glCtx.FRAMEBUFFER, glCtx.COLOR_ATTACHMENT0, glCtx.TEXTURE_2D, sceneTex, 0);
      glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null);
    }

    // Physics constants
    const PUSH_FORCE = 0.0008;
    const DRAG = 0.92;
    const ANGULAR_DRAG = 0.94;

    function resize(cvs: HTMLCanvasElement) {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = Math.floor(cvs.clientWidth * dpr);
      const h = Math.floor(cvs.clientHeight * dpr);
      if (cvs.width !== w || cvs.height !== h) {
        cvs.width = w;
        cvs.height = h;
      }
    }

    function updatePhysics(aspect: number) {
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const pushRadius = 0.08 * aspect;

      for (let i = 0; i < NUM_LOGOS; i++) {
        const idx = i * 6;
        const vidx = i * 3;
        let x = logoData[idx];
        let y = logoData[idx + 1];
        let vx = logoVelocity[vidx];
        let vy = logoVelocity[vidx + 1];
        let av = logoVelocity[vidx + 2];
        const mass = logoMass[i];

        // Distance with aspect correction
        const dx = (x - mx) * aspect;
        const dy = y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < pushRadius && dist > 0.001) {
          const strength = (1 - dist / pushRadius);
          const force = strength * strength * PUSH_FORCE / mass;
          const pdx = dx / dist;
          const pdy = dy / dist;
          vx += (pdx / aspect) * force;
          vy += pdy * force;
          av += (Math.random() - 0.5) * force * 40;
        }

        // Drag
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0.00001) {
          vx *= DRAG;
          vy *= DRAG;
          x += vx;
          y += vy;
        } else {
          vx = vy = 0;
        }

        if (Math.abs(av) > 0.0001) {
          av *= ANGULAR_DRAG;
          logoData[idx + 3] += av;
        } else {
          av = 0;
        }

        logoData[idx] = x;
        logoData[idx + 1] = y;
        logoVelocity[vidx] = vx;
        logoVelocity[vidx + 1] = vy;
        logoVelocity[vidx + 2] = av;
      }
    }

    const startTime = performance.now();
    let rippleIntensity = 0;

    function render() {
      if (!gl || !canvas) return;

      resize(canvas);
      const w = canvas.width;
      const h = canvas.height;
      const aspect = w / h;
      const time = (performance.now() - startTime) / 1000;
      const now = performance.now();

      updatePhysics(aspect);
      setupFBO(gl, w, h);

      // Ripple intensity
      const timeSinceMove = now - mouseRef.current.lastMoveTime;
      rippleIntensity = timeSinceMove < 50
        ? Math.min(1.0, rippleIntensity + 0.15)
        : rippleIntensity * 0.95;

      // Prepare trail data
      const maxAge = 2.5;
      rippleTrailRef.current = rippleTrailRef.current.filter(p => (now - p.time) / 1000 < maxAge);
      const trailData = new Float32Array(MAX_TRAIL_POINTS * 4);
      const recentTrail = rippleTrailRef.current.slice(-MAX_TRAIL_POINTS).reverse();
      for (let i = 0; i < recentTrail.length; i++) {
        const p = recentTrail[i];
        const age = (now - p.time) / 1000;
        trailData[i * 4] = p.x;
        trailData[i * 4 + 1] = 1.0 - p.y;
        trailData[i * 4 + 2] = p.strength * (1.0 - age / maxAge);
        trailData[i * 4 + 3] = age;
      }

      // ====== PASS 1: Render logos to FBO ======
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      if (logoImg.complete) {
        gl.useProgram(logoProgram);
        gl.uniform2f(logo_u_res, w, h);
        gl.uniform1f(logo_u_time, time);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, logoTex);
        gl.uniform1i(logo_u_tex, 0);

        // Prepare instance data
        const instDataA = new Float32Array(NUM_LOGOS * 4);
        const instDataB = new Float32Array(NUM_LOGOS * 2);
        for (let i = 0; i < NUM_LOGOS; i++) {
          const idx = i * 6;
          instDataA[i * 4] = logoData[idx];
          instDataA[i * 4 + 1] = logoData[idx + 1];
          instDataA[i * 4 + 2] = logoData[idx + 2];
          instDataA[i * 4 + 3] = logoData[idx + 3];
          instDataB[i * 2] = logoData[idx + 4];
          instDataB[i * 2 + 1] = logoData[idx + 5];
        }

        if (instExt) {
          // Instanced rendering (fast path)
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
          gl.enableVertexAttribArray(logo_a_quad);
          gl.vertexAttribPointer(logo_a_quad, 2, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, instanceBufferA);
          gl.bufferData(gl.ARRAY_BUFFER, instDataA, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(logo_a_instA);
          gl.vertexAttribPointer(logo_a_instA, 4, gl.FLOAT, false, 0, 0);
          instExt.vertexAttribDivisorANGLE(logo_a_instA, 1);

          gl.bindBuffer(gl.ARRAY_BUFFER, instanceBufferB);
          gl.bufferData(gl.ARRAY_BUFFER, instDataB, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(logo_a_instB);
          gl.vertexAttribPointer(logo_a_instB, 2, gl.FLOAT, false, 0, 0);
          instExt.vertexAttribDivisorANGLE(logo_a_instB, 1);

          instExt.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, NUM_LOGOS);

          instExt.vertexAttribDivisorANGLE(logo_a_instA, 0);
          instExt.vertexAttribDivisorANGLE(logo_a_instB, 0);
        } else {
          // Fallback: draw each logo individually
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
          gl.enableVertexAttribArray(logo_a_quad);
          gl.vertexAttribPointer(logo_a_quad, 2, gl.FLOAT, false, 0, 0);

          for (let i = 0; i < NUM_LOGOS; i++) {
            gl.vertexAttrib4f(logo_a_instA, instDataA[i*4], instDataA[i*4+1], instDataA[i*4+2], instDataA[i*4+3]);
            gl.vertexAttrib2f(logo_a_instB, instDataB[i*2], instDataB[i*2+1]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
        }
      }

      // ====== PASS 2: Water effect on screen ======
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);

      gl.useProgram(waterProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, fsQuadBuffer);
      gl.enableVertexAttribArray(water_a_pos);
      gl.vertexAttribPointer(water_a_pos, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(water_u_scene, 0);
      gl.uniform1f(water_u_time, time);
      gl.uniform2f(water_u_mouse, mouseRef.current.x, 1.0 - mouseRef.current.y);
      gl.uniform1f(water_u_ripple, rippleIntensity);
      gl.uniform2f(water_u_res, w, h);
      gl.uniform4fv(water_u_trail, trailData);
      gl.uniform1i(water_u_trailCount, recentTrail.length);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animationRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
      gl.deleteProgram(logoProgram);
      gl.deleteProgram(waterProgram);
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(instanceBufferA);
      gl.deleteBuffer(instanceBufferB);
      gl.deleteBuffer(fsQuadBuffer);
      gl.deleteTexture(logoTex);
      if (sceneFBO) gl.deleteFramebuffer(sceneFBO);
      if (sceneTex) gl.deleteTexture(sceneTex);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}

export default function MarketingHome() {
  const { consoleUrl, locale, t } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showModal, setShowModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const languageNames: Record<Locale, string> = {
    en: "English",
    es: "Español",
  };

  const switchLocale = (newLocale: Locale) => {
    // Navigate to the new locale URL
    if (newLocale === defaultLocale) {
      // Default locale uses root path
      window.location.href = "/";
    } else {
      // Other locales use prefix
      window.location.href = `/${newLocale}`;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="fixed top-4 left-4 right-4 z-50">
        <div className="max-w-6xl mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 shadow-lg shadow-black/20">
          <nav className="flex justify-between items-center">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2 group">
              <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-8 h-8" />
              <span className="text-lg lowercase logo-text">secret lobby</span>
            </a>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-300 hover:text-white transition">
                {t.nav.features}
              </a>
              <a href="#how-it-works" className="text-sm text-gray-300 hover:text-white transition">
                {t.nav.howItWorks}
              </a>
              <a href="#pricing" className="text-sm text-gray-300 hover:text-white transition">
                {t.nav.pricing}
              </a>
              <a href="#faq" className="text-sm text-gray-300 hover:text-white transition">
                {t.nav.faq}
              </a>
            </div>

            {/* Auth Buttons & Language */}
            <div className="hidden md:flex items-center gap-4">
              {/* Language Switcher */}
              <div className="relative">
                <button
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition"
                >
                  <GlobeIcon className="w-4 h-4" />
                  <span>{languageNames[locale as Locale]}</span>
                </button>
                {langMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl py-1 min-w-[120px]">
                    {locales.map((loc) => (
                      <button
                        key={loc}
                        onClick={() => {
                          switchLocale(loc);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 transition ${
                          loc === locale ? "text-[#ed1b2f]" : "text-gray-300"
                        }`}
                      >
                        {languageNames[loc]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <a href={`${consoleUrl}/login`} className="text-sm text-gray-300 hover:text-white transition">
                {t.nav.signIn}
              </a>
              <button
                onClick={() => setShowModal(true)}
                className="bg-[#ed1b2f] hover:bg-[#d4192a] text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                {t.nav.getStarted}
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-gray-300"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </nav>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pt-4 pb-2 border-t border-white/10 mt-4">
              <div className="flex flex-col gap-4">
                <a href="#features" className="text-sm text-gray-300 hover:text-white transition">
                  {t.nav.features}
                </a>
                <a href="#how-it-works" className="text-sm text-gray-300 hover:text-white transition">
                  {t.nav.howItWorks}
                </a>
                <a href="#pricing" className="text-sm text-gray-300 hover:text-white transition">
                  {t.nav.pricing}
                </a>
                <a href="#faq" className="text-sm text-gray-300 hover:text-white transition">
                  {t.nav.faq}
                </a>

                {/* Mobile Language Switcher */}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                  {locales.map((loc) => (
                    <button
                      key={loc}
                      onClick={() => switchLocale(loc)}
                      className={`px-3 py-1 text-sm rounded transition ${
                        loc === locale
                          ? "bg-[#ed1b2f] text-white"
                          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {languageNames[loc]}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <a href={`${consoleUrl}/login`} className="text-sm text-gray-300 hover:text-white transition">
                    {t.nav.signIn}
                  </a>
                  <button
                    onClick={() => setShowModal(true)}
                    className="bg-[#ed1b2f] hover:bg-[#d4192a] text-white px-4 py-2 rounded-lg text-sm font-medium transition w-full"
                  >
                    {t.nav.getStarted}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-28 pb-20 px-4 relative overflow-hidden">
        {/* Logo Distortion Shader Background */}
        <LogoDistortionBackground />
        <div className="container mx-auto text-center max-w-4xl relative z-10 pointer-events-none">
          {/* Logo - hidden since it's in the shader background */}
          <div className="mb-8 flex justify-center invisible">
            <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-24 h-24" />
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            {t.hero.headline1}
            <br />
            <span className="text-[#ed1b2f]">{t.hero.headline2}</span>
            <br />
            {t.hero.headline3}
          </h1>

          {/* Subtitle */}
          <p className="text-gray-400 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
            {t.hero.subtitle}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 pointer-events-auto">
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#ed1b2f] hover:bg-[#d4192a] text-white px-8 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
            >
              {t.hero.cta}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button className="border border-gray-600 hover:border-gray-500 text-white px-8 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2">
              <PlayIcon className="w-4 h-4" />
              {t.hero.demo}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto pointer-events-auto">
            <div className="animated-border">
              <div className="animated-border-content p-6">
                <div className="text-3xl font-bold text-white mb-1">{t.hero.stat1Value}</div>
                <div className="text-gray-400 text-sm">{t.hero.stat1Label}</div>
              </div>
            </div>
            <div className="animated-border">
              <div className="animated-border-content p-6">
                <div className="text-3xl font-bold text-white mb-1">{t.hero.stat2Value}</div>
                <div className="text-gray-400 text-sm">{t.hero.stat2Label}</div>
              </div>
            </div>
            <div className="animated-border">
              <div className="animated-border-content p-6">
                <div className="text-3xl font-bold text-white mb-1">{t.hero.stat3Value}</div>
                <div className="text-gray-400 text-sm">{t.hero.stat3Label}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-[#0f0f0f] relative overflow-hidden">
        {/* Shader Background */}
        <MusicWaveBackground />
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t.features.title}
              <br />
              <span className="text-[#ed1b2f]">{t.features.titleHighlight}</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              {t.features.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {t.features.items.map((feature, index) => {
              const Icon = featureIcons[index];
              return (
                <AnimatedBorderCard key={index}>
                  <div className="w-10 h-10 bg-[#ed1b2f]/10 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#ed1b2f]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-400 text-sm">{feature.description}</p>
                </AnimatedBorderCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t.howItWorks.title} <span className="text-[#ed1b2f]">{t.howItWorks.titleHighlight}</span> {t.howItWorks.titleEnd}
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              {t.howItWorks.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {t.howItWorks.steps.map((step, index) => {
              const Icon = stepIcons[index];
              const stepNumber = String(index + 1).padStart(2, "0");
              return (
                <div key={index} className="text-center relative">
                  {/* Step Number */}
                  <div className="text-6xl font-bold text-[#ed1b2f]/20 mb-4">{stepNumber}</div>

                  {/* Icon */}
                  <div className="w-14 h-14 bg-[#ed1b2f]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#ed1b2f]/30">
                    <Icon className="w-6 h-6 text-[#ed1b2f]" />
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-gray-400 text-sm">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] border border-gray-800 rounded-2xl p-12 text-center">
            {/* Logo */}
            <div className="mb-8 flex justify-center">
              <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-20 h-20" />
            </div>

            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t.cta.title}
              <br />
              <span className="text-[#ed1b2f]">{t.cta.titleHighlight}</span>
            </h2>

            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              {t.cta.subtitle}
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={() => setShowModal(true)}
                className="bg-[#ed1b2f] hover:bg-[#d4192a] text-white px-8 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
              >
                {t.cta.button}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button className="border border-gray-600 hover:border-gray-500 text-white px-8 py-3 rounded-lg font-semibold transition">
                {t.cta.sales}
              </button>
            </div>

            {/* Benefits */}
            <p className="text-gray-500 text-sm mb-4">
              {t.cta.freeNote}
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-[#ed1b2f]" />
                {t.cta.benefit1}
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-[#ed1b2f]" />
                {t.cta.benefit2}
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-[#ed1b2f]" />
                {t.cta.benefit3}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-800 bg-[#0a0a0a]">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-8 h-8" />
                <span className="text-lg font-semibold">Secret Lobby</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                {t.footer.tagline}
              </p>
              {/* Social Icons */}
              <div className="flex gap-4">
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z" />
                    <circle cx="12" cy="12" r="3.5" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">{t.footer.product}</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#features" className="hover:text-white transition">{t.footer.features}</a></li>
                <li><a href="#pricing" className="hover:text-white transition">{t.footer.pricing}</a></li>
                <li><a href="#" className="hover:text-white transition">{t.footer.security}</a></li>
                <li><a href="#" className="hover:text-white transition">{t.footer.roadmap}</a></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4">{t.footer.company}</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition">{t.footer.about}</a></li>
                <li><a href="#" className="hover:text-white transition">{t.footer.blog}</a></li>
                <li><a href="#" className="hover:text-white transition">{t.footer.contact}</a></li>
                <li><a href="#" className="hover:text-white transition">{t.footer.terms}</a></li>
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h4 className="font-semibold mb-4">{t.footer.newsletter}</h4>
              <p className="text-gray-400 text-sm mb-4">
                {t.footer.newsletterText}
              </p>
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="source" value="footer-newsletter" />
                <input
                  type="email"
                  name="email"
                  placeholder={t.modal.placeholder}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ed1b2f]"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#ed1b2f] hover:bg-[#d4192a] text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  →
                </button>
              </Form>
            </div>
          </div>

          {/* Bottom */}
          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              {t.footer.copyright}
            </p>
            <div className="flex gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition">{t.footer.privacy}</a>
              <a href="#" className="hover:text-white transition">{t.footer.terms}</a>
              <a href="#" className="hover:text-white transition">{t.footer.cookies}</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal Content */}
          <div className="relative animated-border max-w-md w-full rounded-2xl">
            <div className="animated-border-content p-8 rounded-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition z-10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="text-center mb-6">
                <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-16 h-16 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-2">{t.modal.title}</h3>
                <p className="text-gray-400 text-sm">
                  {t.modal.subtitle}
                </p>
              </div>

              {actionData?.success ? (
                <div className="bg-green-900/30 border border-green-700 text-green-400 px-6 py-4 rounded-lg text-center">
                  {actionData.message}
                </div>
              ) : (
                <Form method="post">
                  <input type="hidden" name="source" value="modal-cta" />
                  <input
                    type="email"
                    name="email"
                    placeholder={t.modal.placeholder}
                    required
                    className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ed1b2f] mb-4"
                  />
                  {actionData?.error && (
                    <p className="text-[#ed1b2f] text-sm mb-4">{actionData.error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#ed1b2f] hover:bg-[#d4192a] text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    {isSubmitting ? t.modal.submitting : t.modal.button}
                  </button>
                </Form>
              )}

              <p className="text-gray-500 text-xs text-center mt-4">
                {t.modal.privacy}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
