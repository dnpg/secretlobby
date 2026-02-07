import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { forgotPasswordSchema, generatePasswordResetToken } from "@secretlobby/auth";
import { sendPasswordResetEmail } from "@secretlobby/email";
import { cn } from "@secretlobby/ui";
import { useRef, useEffect } from "react";

// WebGL Shader Background for music-inspired waves
function MusicWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;

      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
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
        vec3 bgColor = vec3(0.059, 0.059, 0.059);

        float wave1 = sin(uv.x * 8.0 + u_time * 0.3 + snoise(uv * 2.0 + u_time * 0.1) * 2.0) * 0.5 + 0.5;
        float wave2 = sin(uv.x * 12.0 - u_time * 0.2 + snoise(uv * 3.0 - u_time * 0.15) * 1.5) * 0.5 + 0.5;
        float wave3 = sin(uv.x * 6.0 + u_time * 0.4 + snoise(uv * 1.5 + u_time * 0.08) * 3.0) * 0.5 + 0.5;

        float y = uv.y;
        float band1 = smoothstep(0.0, 0.06, abs(y - 0.25 - wave1 * 0.08));
        float band2 = smoothstep(0.0, 0.05, abs(y - 0.5 - wave2 * 0.07));
        float band3 = smoothstep(0.0, 0.07, abs(y - 0.75 - wave3 * 0.09));

        float noise = snoise(uv * 4.0 + u_time * 0.05) * 0.5 + 0.5;

        vec3 redColor = vec3(0.929, 0.106, 0.184);
        vec3 darkRed = vec3(0.5, 0.05, 0.1);
        vec3 whiteColor = vec3(1.0, 0.9, 0.9);

        float waveIntensity = (1.0 - band1) * 0.35 + (1.0 - band2) * 0.3 + (1.0 - band3) * 0.25;
        waveIntensity *= noise * 0.6 + 0.4;

        float flowNoise = snoise(vec2(uv.x * 3.0 + u_time * 0.1, uv.y * 2.0)) * 0.5 + 0.5;
        flowNoise *= snoise(vec2(uv.x * 5.0 - u_time * 0.08, uv.y * 3.0 + u_time * 0.05)) * 0.5 + 0.5;

        float redFog = snoise(uv * 2.0 + u_time * 0.03) * 0.5 + 0.5;
        redFog *= 0.15;

        vec3 waveColor = mix(redColor, whiteColor, flowNoise * 0.15);
        waveColor = mix(darkRed, waveColor, waveIntensity);
        vec3 finalColor = mix(bgColor, waveColor, waveIntensity * 0.7 + redFog);

        float vignette = 1.0 - length(uv - 0.5) * 0.2;
        finalColor *= vignette;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

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

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");

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

export function meta() {
  return [{ title: "Forgot Password - Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getCsrfToken } = await import("@secretlobby/auth");
  const csrfToken = await getCsrfToken(request);
  const marketingUrl = process.env.MARKETING_URL ? process.env.MARKETING_URL : "https://secretlobby.co";
  return { csrfToken, marketingUrl };
}

export async function action({ request }: Route.ActionArgs) {
  const { getSession } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS } = await import("@secretlobby/auth/rate-limit");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:password-reset" });

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  // Check rate limit before processing
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.PASSWORD_RESET);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  const formData = await request.formData();
  const rawEmail = formData.get("email");

  const parsed = forgotPasswordSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message, sent: false };
  }

  const result = await generatePasswordResetToken(parsed.data.email);

  if (result) {
    const authUrl = process.env.AUTH_URL || "http://localhost:3001";
    const resetUrl = `${authUrl}/reset-password?token=${result.token}`;

    try {
      await sendPasswordResetEmail({
        to: result.user.email,
        resetUrl,
        userName: result.user.name || undefined,
      });
    } catch (e) {
      logger.error(
        { email: result.user.email, error: formatError(e) },
        "Failed to send password reset email"
      );
    }
  }

  // Always return success to prevent email enumeration
  return { sent: true };
}

export default function ForgotPassword() {
  const { csrfToken, marketingUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] auth-page relative overflow-hidden">
      <MusicWaveBackground />
      <div className="w-full max-w-md p-8 relative z-10">
        <div className="animated-border rounded-2xl" style={{ "--animation-delay": "-3s" } as React.CSSProperties}>
          <div className="animated-border-content p-8 rounded-2xl">
            <div className="text-center mb-8">
              <a href={marketingUrl} className="flex justify-center mb-4">
                <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-16 h-16" />
              </a>
              <h1 className="text-2xl font-bold text-white">Reset Password</h1>
              <p className="text-gray-400 mt-2" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
                Enter your email and we'll send you a reset link
              </p>
            </div>

            {actionData?.sent ? (
              <div className="text-center">
                <div className="mb-4 text-green-400 bg-green-500/10 border border-green-700 py-4 px-4 rounded-lg">
                  <p className="font-medium">Check your email</p>
                  <p className="text-sm text-green-300 mt-1">
                    If an account exists with that email, you'll receive a password reset link.
                  </p>
                </div>
                <a
                  href="/login"
                  className="text-[#ed1b2f] hover:text-[#ff3347] text-sm font-medium"
                >
                  Back to login
                </a>
              </div>
            ) : (
              <>
                {actionData?.error && (
                  <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 border border-red-700 py-3 px-4 rounded-lg">
                    {actionData.error}
                  </div>
                )}

                <Form method="post" className="space-y-4">
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn("w-full py-3 px-4 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:ring-offset-2 focus:ring-offset-[#1a1a1a] disabled:opacity-50 transition", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
                  >
                    {isSubmitting ? "Sending..." : "Send Reset Link"}
                  </button>
                </Form>

                <div className="mt-6 text-center text-sm text-gray-400">
                  <a href="/login" className="text-[#ed1b2f] hover:text-[#ff3347] font-medium">
                    Back to login
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
