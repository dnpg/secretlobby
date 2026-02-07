import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { cn } from "@secretlobby/ui";
import { defaultLoginPageSettings, type LoginPageSettings } from "~/lib/content.server";
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

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured.",
  missing_oauth_params: "Missing OAuth parameters. Please try again.",
  session_expired: "Your session expired. Please try again.",
  invalid_state: "Invalid OAuth state. Please try again.",
  unauthorized_domain: "Your email domain is not authorized.",
  no_account_access: "You don't have access to any accounts. Contact an administrator.",
  oauth_failed: "Authentication failed. Please try again.",
  access_denied: "Access was denied. Please try again.",
};

export function meta() {
  return [{ title: "Login - Console" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, getCsrfToken, isGoogleConfigured } = await import("@secretlobby/auth");
  const { getPublicUrl } = await import("@secretlobby/storage");
  const { getFirstAccountSettings } = await import("~/models/queries/account.server");
  const { getSystemSettings } = await import("~/models/queries/invitation.server");

  const { session } = await getSession(request);
  const url = new URL(request.url);
  const errorCode = url.searchParams.get("error");

  if (session.userId) {
    throw redirect("/");
  }

  // Check system settings for prelaunch mode
  const systemSettings = await getSystemSettings();
  const prelaunchMode = systemSettings?.prelaunchMode ?? false;
  const marketingUrl = process.env.MARKETING_URL ? process.env.MARKETING_URL : "https://secretlobby.co";

  // Load login page customization from the first account
  let loginSettings: LoginPageSettings = defaultLoginPageSettings;
  let logoImageUrl: string | null = null;

  const account = await getFirstAccountSettings();

  if (account?.settings && typeof account.settings === "object") {
    const settings = account.settings as Record<string, unknown>;
    if (settings.loginPage && typeof settings.loginPage === "object") {
      loginSettings = { ...defaultLoginPageSettings, ...(settings.loginPage as Partial<LoginPageSettings>) };
    }
  }

  if (loginSettings.logoType === "image" && loginSettings.logoImage) {
    logoImageUrl = getPublicUrl(loginSettings.logoImage);
  }

  const csrfToken = await getCsrfToken(request);

  return {
    googleEnabled: isGoogleConfigured(),
    errorMessage: errorCode ? ERROR_MESSAGES[errorCode] || `Authentication error: ${errorCode}` : null,
    loginSettings,
    logoImageUrl,
    csrfToken,
    prelaunchMode,
    marketingUrl,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { authenticateWithPassword, createSessionResponse } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  // Check rate limit before processing
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Invalid form data" };
  }

  const result = await authenticateWithPassword(email, password);

  if (!result.success) {
    if (result.error === "account_locked") {
      const minutes = Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000);
      return {
        error: `Account locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
        locked: true,
      };
    }

    // invalid_credentials
    if (result.remainingAttempts === 1) {
      return {
        error: "Invalid email or password. You have 1 attempt remaining before your account is locked.",
        warning: true,
      };
    }

    return { error: "Invalid email or password" };
  }

  const user = result.user;

  if (user.accounts.length === 0) {
    return { error: "You don't have access to any accounts. Contact an administrator." };
  }

  const primaryAccount = user.accounts[0];
  const hasAdminRole = primaryAccount.role === "OWNER" || primaryAccount.role === "ADMIN";

  // Reset rate limit on successful login
  await resetRateLimit(request, RATE_LIMIT_CONFIGS.LOGIN);

  return createSessionResponse(
    {
      isAuthenticated: true,
      isAdmin: hasAdminRole,
      userId: user.id,
      userEmail: user.email,
      userName: user.name || undefined,
      currentAccountId: primaryAccount.accountId,
      currentAccountSlug: primaryAccount.account.slug,
      currentAccountRole: primaryAccount.role,
    },
    request,
    "/"
  );
}

export default function Login() {
  const { googleEnabled, errorMessage, loginSettings, logoImageUrl, csrfToken, prelaunchMode, marketingUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const displayError = errorMessage || actionData?.error;
  const isWarning = actionData?.warning;
  const isLocked = actionData?.locked;

  const { title, description, logoType } = loginSettings;

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-[#0f0f0f] auth-page relative overflow-hidden"
      aria-label="Login"
    >
      <MusicWaveBackground />
      <div className="w-full max-w-md p-8 relative z-10">
        <div className="animated-border rounded-2xl" style={{ "--animation-delay": "-3s" } as React.CSSProperties}>
          <div className="animated-border-content p-8 rounded-2xl">
            <div className="text-center mb-8">
              {logoType === "image" && logoImageUrl ? (
                <a href={marketingUrl} className="flex justify-center mb-4">
                  <img src={logoImageUrl} alt={title || "Logo"} className="max-w-[180px] max-h-[60px] object-contain" />
                </a>
              ) : (
                <a href={marketingUrl} className="flex justify-center mb-4">
                  <img src="/secret-lobby-logo.svg" alt="Secret Lobby" className="w-16 h-16" />
                </a>
              )}
              <h1 className="text-2xl font-bold text-white">
                {title || "Welcome Back"}
              </h1>
              {description && (
                <p className="mt-2 text-gray-400">
                  {description}
                </p>
              )}
            </div>

            {displayError && (
              <div
                role="alert"
                aria-live="polite"
                className={`mb-6 text-sm text-center py-3 px-4 rounded-lg ${
                  isWarning
                    ? "text-yellow-400 bg-yellow-500/10 border border-yellow-700"
                    : "text-red-400 bg-red-500/10 border border-red-700"
                }`}
              >
                <p>{displayError}</p>
                {isLocked && (
                  <a href="/forgot-password" className="block mt-2 text-[#ed1b2f] hover:text-[#ff3347] font-medium text-xs">
                    Reset your password to unlock immediately
                  </a>
                )}
              </div>
            )}

            {googleEnabled && (
              <>
                <a
                  href="/auth/google"
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition"
                  aria-label="Sign in with Google"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </a>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#1a1a1a] text-gray-400">or</span>
                  </div>
                </div>
              </>
            )}

            <Form method="post" className="space-y-4">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1 text-gray-300">
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
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                    Password
                  </label>
                  <a href="/forgot-password" className="text-xs text-[#ed1b2f] hover:text-[#ff3347]">
                    Forgot password?
                  </a>
                </div>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn("w-full py-3 px-4 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:ring-offset-2 focus:ring-offset-[#1a1a1a] disabled:opacity-50 transition", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
              >
                {isSubmitting ? "Signing in..." : "Sign In"}
              </button>
            </Form>

            {prelaunchMode ? (
              <div className="mt-6 text-center text-sm text-gray-400">
                <p className="mb-2">We're currently in private beta.</p>
                <div className="space-y-1">
                  <a
                    href={marketingUrl}
                    className="block text-[#ed1b2f] hover:text-[#ff3347] font-medium"
                  >
                    Register your interest
                  </a>
                  <span className="text-gray-500">or</span>
                  <a
                    href="/signup"
                    className="block text-[#ed1b2f] hover:text-[#ff3347] font-medium"
                  >
                    Have an invite code? Sign up here
                  </a>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-center text-sm text-gray-400">
                Don't have an account?{" "}
                <a href="/signup" className="text-[#ed1b2f] hover:text-[#ff3347] font-medium">
                  Sign up
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
