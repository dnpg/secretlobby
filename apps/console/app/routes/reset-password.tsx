import { useState, useRef, useEffect } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { verifyPasswordResetToken, resetPassword, resetPasswordSchema } from "@secretlobby/auth";
import { PASSWORD_REQUIREMENTS, checkPasswordRequirements } from "@secretlobby/auth/requirements";
import { cn } from "@secretlobby/ui";

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
  return [{ title: "Reset Password - Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { getCsrfToken } = await import("@secretlobby/auth");
  const marketingUrl = process.env.MARKETING_URL ? process.env.MARKETING_URL : "https://secretlobby.co";

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return { valid: false, error: "No reset token provided", marketingUrl };
  }

  const result = await verifyPasswordResetToken(token);
  if (!result.valid) {
    return { valid: false, error: result.error, marketingUrl };
  }

  const csrfToken = await getCsrfToken(request);

  return { valid: true, token, csrfToken, marketingUrl };
}

export async function action({ request }: Route.ActionArgs) {
  const { csrfProtect } = await import("@secretlobby/auth/csrf");

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  const formData = await request.formData();
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const err of parsed.error.errors) {
      const field = err.path[0]?.toString() || "form";
      errors[field] = err.message;
    }
    return { success: false, errors };
  }

  // Re-verify token before resetting
  const verification = await verifyPasswordResetToken(parsed.data.token);
  if (!verification.valid) {
    return { success: false, errors: { form: "This reset link has expired. Please request a new one." } };
  }

  await resetPassword(verification.userId, parsed.data.password);
  return { success: true };
}

function PasswordRequirementsList({ password }: { password: string }) {
  const results = checkPasswordRequirements(password);
  const hasInput = password.length > 0;

  return (
    <div className="mt-3 p-3 rounded-lg bg-[#0a0a0a] border border-gray-700">
      <p className="text-xs font-medium text-gray-400 mb-2">Password must contain:</p>
      <ul className="space-y-1.5">
        {PASSWORD_REQUIREMENTS.map((req) => {
          const met = hasInput && results[req.key];
          return (
            <li key={req.key} className="flex items-center gap-2 text-xs">
              <span className={`w-4 text-center ${met ? "text-green-400" : "text-gray-500"}`}>
                {hasInput ? (met ? "\u2713" : "\u2717") : "\u2022"}
              </span>
              <span className={met ? "text-green-300" : "text-gray-400"}>
                {req.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ResetPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const marketingUrl = loaderData.marketingUrl;

  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((req) => req.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRequirementsMet && passwordsMatch && !isSubmitting;

  // Success state (check before invalid token, since action clears the token)
  if (actionData?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] auth-page relative overflow-hidden">
        <MusicWaveBackground />
        <div className="w-full max-w-md p-8 relative z-10">
          <div className="animated-border rounded-2xl" style={{ "--animation-delay": "-3s" } as React.CSSProperties}>
            <div className="animated-border-content p-8 rounded-2xl">
              <div className="text-center">
                <a href={marketingUrl} className="flex justify-center mb-4">
                  <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-16 h-16" />
                </a>
                <div className="mb-4 text-green-400 bg-green-500/10 border border-green-700 py-4 px-4 rounded-lg">
                  <p className="font-medium">Password Reset Successful</p>
                  <p className="text-sm text-green-300 mt-1">
                    Your password has been updated. You can now sign in with your new password.
                  </p>
                </div>
                <a
                  href="/login"
                  className="inline-block mt-4 py-3 px-6 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] transition cursor-pointer"
                >
                  Sign In
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!loaderData.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] auth-page relative overflow-hidden">
        <MusicWaveBackground />
        <div className="w-full max-w-md p-8 relative z-10">
          <div className="animated-border rounded-2xl" style={{ "--animation-delay": "-3s" } as React.CSSProperties}>
            <div className="animated-border-content p-8 rounded-2xl">
              <div className="text-center">
                <a href={marketingUrl} className="flex justify-center mb-4">
                  <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-16 h-16" />
                </a>
                <div className="mb-4 text-red-400 bg-red-500/10 border border-red-700 py-4 px-4 rounded-lg">
                  <p className="font-medium">Invalid or Expired Link</p>
                  <p className="text-sm text-red-300 mt-1">
                    {loaderData.error || "This password reset link is no longer valid."}
                  </p>
                </div>
                <a
                  href="/forgot-password"
                  className="inline-block mt-4 py-3 px-6 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] transition cursor-pointer"
                >
                  Request New Link
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] auth-page relative overflow-hidden">
      <MusicWaveBackground />
      <div className="w-full max-w-md p-8 relative z-10">
        <div className="animated-border rounded-2xl" style={{ "--animation-delay": "-3s" } as React.CSSProperties}>
          <div className="animated-border-content p-8 rounded-2xl">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-16 h-16" />
              </div>
              <h1 className="text-2xl font-bold text-white">Set New Password</h1>
              <p className="text-gray-400 mt-2">Choose a strong password for your account</p>
            </div>

            {actionData?.errors?.form && (
              <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 border border-red-700 py-3 px-4 rounded-lg">
                {actionData.errors.form}
              </div>
            )}

            <Form method="post" className="space-y-4">
              <input type="hidden" name="token" value={loaderData.token} />
              <input type="hidden" name="_csrf" value={loaderData.csrfToken} />

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
                <PasswordRequirementsList password={password} />
                {actionData?.errors?.password && (
                  <p className="mt-1 text-xs text-red-400">{actionData.errors.password}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
                {confirmPassword.length > 0 && (
                  <p className={`mt-1 text-xs ${passwordsMatch ? "text-green-400" : "text-red-400"}`}>
                    {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
                  </p>
                )}
                {actionData?.errors?.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400">{actionData.errors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className={cn("w-full py-3 px-4 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:ring-offset-2 focus:ring-offset-[#1a1a1a] disabled:opacity-50 transition", {"cursor-pointer": canSubmit, "cursor-not-allowed": !canSubmit})}
              >
                {isSubmitting ? "Resetting..." : "Reset Password"}
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
