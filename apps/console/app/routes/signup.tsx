import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { cn } from "@secretlobby/ui";
import { useState, useEffect, useRef } from "react";

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
  return [{ title: "Sign Up - Console" }];
}

const ERROR_MESSAGES: Record<string, string> = {
  invite_required: "An invitation code is required to sign up during our private beta.",
  invalid_invite: "Your invitation code is invalid or expired. Please check and try again.",
  email_mismatch: "The Google account email doesn't match the invitation. Please use the correct Google account.",
};

export async function loader({ request }: Route.LoaderArgs) {
  // Server-only imports
  const { getSession, getCsrfToken, isGoogleConfigured } = await import("@secretlobby/auth");
  const { getValidInvitationByCode, getSystemSettings } = await import("~/models/queries/invitation.server");

  const { session } = await getSession(request);

  if (session.userId) {
    throw redirect("/");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorCode = url.searchParams.get("error");

  // Check system settings
  const settings = await getSystemSettings();
  const prelaunchMode = settings?.prelaunchMode ?? false;

  // Get error message from URL if present
  const urlErrorMessage = errorCode ? ERROR_MESSAGES[errorCode] || null : null;

  // In prelaunch mode, require valid invite code
  if (prelaunchMode) {
    const marketingUrl = process.env.MARKETING_URL ? process.env.MARKETING_URL : "https://secretlobby.co";

    if (!code) {
      // No code provided - show code entry form
      const csrfToken = await getCsrfToken(request);
      return {
        googleEnabled: isGoogleConfigured(),
        csrfToken,
        inviteCode: null,
        inviteEmail: null,
        inviteName: null,
        prelaunchMode: true,
        needsCodeValidation: true,
        marketingUrl,
        urlError: urlErrorMessage,
      };
    }

    const invitation = await getValidInvitationByCode(code);
    if (!invitation) {
      // Invalid or expired code - show code entry form with error
      const csrfToken = await getCsrfToken(request);
      return {
        googleEnabled: isGoogleConfigured(),
        csrfToken,
        inviteCode: null,
        inviteEmail: null,
        inviteName: null,
        prelaunchMode: true,
        needsCodeValidation: true,
        codeError: "Invalid or expired invitation code. Please check your code and try again.",
        marketingUrl,
        urlError: urlErrorMessage,
      };
    }

    const csrfToken = await getCsrfToken(request);
    return {
      googleEnabled: isGoogleConfigured(),
      csrfToken,
      inviteCode: code,
      inviteEmail: invitation.email,
      inviteName: invitation.interestedPerson?.name || null,
      prelaunchMode: true,
      needsCodeValidation: false,
      marketingUrl,
      urlError: urlErrorMessage,
    };
  }

  // Not in prelaunch mode - allow normal signup
  const csrfToken = await getCsrfToken(request);
  const marketingUrl = process.env.MARKETING_URL ? process.env.MARKETING_URL : "https://secretlobby.co";

  // If code provided, validate it optionally
  if (code) {
    const invitation = await getValidInvitationByCode(code);
    if (invitation) {
      return {
        googleEnabled: isGoogleConfigured(),
        csrfToken,
        inviteCode: code,
        inviteEmail: invitation.email,
        inviteName: invitation.interestedPerson?.name || null,
        prelaunchMode: false,
        needsCodeValidation: false,
        marketingUrl,
        urlError: urlErrorMessage,
      };
    }
  }

  return {
    googleEnabled: isGoogleConfigured(),
    csrfToken,
    inviteCode: null,
    inviteEmail: null,
    inviteName: null,
    prelaunchMode: false,
    needsCodeValidation: false,
    marketingUrl,
    urlError: urlErrorMessage,
  };
}

export async function action({ request }: Route.ActionArgs) {
  // Server-only imports
  const { createSessionResponse, createUser, addUserToAccount, getSession } = await import("@secretlobby/auth");
  const { csrfProtect } = await import("@secretlobby/auth/csrf");
  const { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS, resetRateLimit } = await import("@secretlobby/auth/rate-limit");
  const { getUserByEmail } = await import("~/models/queries/user.server");
  const { getAccountBySlug } = await import("~/models/queries/account.server");
  const { getValidInvitationByCode, getSystemSettings } = await import("~/models/queries/invitation.server");
  const { createAccount, updateAccountDefaultLobby } = await import("~/models/mutations/account.server");
  const { createLobby } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");
  const { prisma, InvitationStatus } = await import("@secretlobby/db");

  const logger = createLogger({ service: "console:signup" });

  // Verify CSRF token (uses HMAC validation - no session needed)
  await csrfProtect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle code validation intent
  if (intent === "validate-code") {
    const email = formData.get("email");
    const code = formData.get("inviteCode");

    if (typeof email !== "string" || typeof code !== "string" || !email.trim() || !code.trim()) {
      return { intent: "validate-code", error: "Email and invitation code are required" };
    }

    const invitation = await getValidInvitationByCode(code.trim());

    if (!invitation) {
      return { intent: "validate-code", error: "Invalid or expired invitation code" };
    }

    if (invitation.email.toLowerCase() !== email.toLowerCase().trim()) {
      return { intent: "validate-code", error: "This invitation code is not associated with this email" };
    }

    // Return validated data for client-side state
    return {
      intent: "validate-code",
      validated: true,
      validatedEmail: invitation.email,
      validatedCode: code.trim(),
      validatedName: invitation.interestedPerson?.name || null,
    };
  }

  // Check rate limit before processing signup
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.SIGNUP);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  // Helper function to generate a unique slug from account name
  async function generateUniqueSlug(name: string): Promise<string> {
    // Convert to slug format: lowercase, replace spaces with hyphens, remove special chars
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    // Ensure it starts with a letter
    if (!/^[a-z]/.test(baseSlug)) {
      baseSlug = `account-${baseSlug}`;
    }

    // Check if slug exists
    let slug = baseSlug;
    let counter = 1;

    while (await getAccountBySlug(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const accountName = formData.get("accountName");
  const inviteCode = formData.get("inviteCode");

  // Validation
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    typeof accountName !== "string"
  ) {
    return { error: "Invalid form data" };
  }

  if (!name.trim() || !email.trim() || !password || !accountName.trim()) {
    return { error: "All fields are required" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters long" };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  // Check system settings for prelaunch mode
  const settings = await getSystemSettings();
  const prelaunchMode = settings?.prelaunchMode ?? false;

  // Validate invite code if in prelaunch mode or if code provided
  let invitation = null;
  if (inviteCode && typeof inviteCode === "string") {
    invitation = await getValidInvitationByCode(inviteCode);

    if (!invitation) {
      return { error: "Invalid or expired invitation code" };
    }

    // Ensure email matches the invitation
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return { error: "Email does not match the invitation" };
    }
  } else if (prelaunchMode) {
    return { error: "An invitation code is required during prelaunch" };
  }

  // Check if email already exists
  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    return { error: "An account with this email already exists" };
  }

  try {
    // Create user
    const user = await createUser(email, password, name);

    // Generate unique slug for account
    const slug = await generateUniqueSlug(accountName);

    // Create account
    const account = await createAccount({
      name: accountName,
      slug,
      subscriptionTier: "FREE",
    });

    // Link user to account as OWNER
    await addUserToAccount(user.id, account.id, "OWNER");

    // Create default lobby for the account
    const defaultLobby = await createLobby({
      accountId: account.id,
      name: "Main Lobby",
      slug: "main",
      title: accountName,
      description: `Welcome to ${accountName}`,
      isDefault: true,
      isPublished: false,
    });

    // Update account with default lobby reference
    await updateAccountDefaultLobby(account.id, defaultLobby.id);

    // Mark invitation as used if present
    if (invitation) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.USED,
          usedAt: new Date(),
        },
      });

      // Update interested person if linked
      if (invitation.interestedPersonId) {
        await prisma.interestedPerson.update({
          where: { id: invitation.interestedPersonId },
          data: { convertedAt: new Date() },
        });
      }

      logger.info({ email, invitationId: invitation.id }, "Invitation used for signup");
    }

    // Reset rate limit on successful signup
    await resetRateLimit(request, RATE_LIMIT_CONFIGS.SIGNUP);

    // Create session and redirect
    return createSessionResponse(
      {
        isAuthenticated: true,
        isAdmin: true,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || undefined,
        currentAccountId: account.id,
        currentAccountSlug: account.slug,
        currentAccountRole: "OWNER",
      },
      request,
      "/"
    );
  } catch (error) {
    logger.error({ error: formatError(error) }, "Signup error");
    return { error: "Failed to create account. Please try again." };
  }
}

export default function Signup() {
  const { googleEnabled, csrfToken, inviteCode, inviteEmail, inviteName, prelaunchMode, needsCodeValidation, codeError, marketingUrl, urlError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Track validated state from code validation action
  const [validatedData, setValidatedData] = useState<{
    email: string;
    code: string;
    name: string | null;
  } | null>(null);

  // Check if code was validated via action
  const wasCodeValidated = actionData?.intent === "validate-code" && actionData?.validated;

  // Update validatedData when action returns validated data
  useEffect(() => {
    if (wasCodeValidated && actionData?.validatedEmail && actionData?.validatedCode) {
      setValidatedData({
        email: actionData.validatedEmail,
        code: actionData.validatedCode,
        name: actionData.validatedName ?? null,
      });
    }
  }, [wasCodeValidated, actionData?.validatedEmail, actionData?.validatedCode, actionData?.validatedName]);

  // Determine the effective invite data
  const effectiveInviteEmail = inviteEmail || validatedData?.email || null;
  const effectiveInviteCode = inviteCode || validatedData?.code || null;
  const effectiveInviteName = inviteName || validatedData?.name || null;

  // Should show code entry form?
  const showCodeEntryForm = prelaunchMode && needsCodeValidation && !validatedData;

  // Has validated invite (either from URL or from validation step)?
  const hasInvite = !!effectiveInviteCode && !!effectiveInviteEmail;

  // Get error message for the current context
  const validationError = actionData?.intent === "validate-code" && !actionData?.validated ? actionData?.error : null;
  const signupError = actionData?.intent !== "validate-code" ? actionData?.error : null;

  // Code entry form for prelaunch mode
  if (showCodeEntryForm) {
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
                <h1 className="text-2xl font-bold text-white">Welcome to SecretLobby</h1>
                <p className="text-gray-400 mt-2">Enter your invitation details to get started</p>
              </div>

              <div className="mb-6 bg-[#ed1b2f]/10 border border-[#ed1b2f]/30 text-gray-300 py-3 px-4 rounded-lg text-center">
                <p className="text-sm">We're currently in private beta.</p>
                <p className="text-xs text-gray-400 mt-1">You need an invitation code to create an account.</p>
              </div>

              {(codeError || validationError || urlError) && (
                <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 border border-red-700 py-3 px-4 rounded-lg">
                  {codeError || validationError || urlError}
                </div>
              )}

              <Form method="post" className="space-y-4">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <input type="hidden" name="intent" value="validate-code" />

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                    Email Address
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
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the email address your invitation was sent to
                  </p>
                </div>

                <div>
                  <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-300 mb-1">
                    Invitation Code
                  </label>
                  <input
                    type="text"
                    id="inviteCode"
                    name="inviteCode"
                    placeholder="Paste your invitation code"
                    required
                    className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The 64-character code from your invitation email
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn("w-full py-3 px-4 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:ring-offset-2 focus:ring-offset-[#1a1a1a] disabled:opacity-50 transition", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
                >
                  {isSubmitting ? "Validating..." : "Continue"}
                </button>
              </Form>

              <div className="mt-6 text-center text-sm text-gray-400">
                Already have an account?{" "}
                <a href="/login" className="text-[#ed1b2f] hover:text-[#ff3347] font-medium">
                  Sign in
                </a>
              </div>

              <div className="mt-4 text-center text-sm text-gray-500">
                Don't have an invitation?{" "}
                <a href={marketingUrl} className="text-[#ed1b2f] hover:text-[#ff3347] font-medium">
                  Register your interest
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full signup form (either no prelaunch, or code already validated)
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
              <h1 className="text-2xl font-bold text-white">Create Your Account</h1>
              <p className="text-gray-400 mt-2">Start building your lobby page</p>
            </div>

            {hasInvite && (
              <div className="mb-6 bg-[#ed1b2f]/10 border border-[#ed1b2f]/30 text-gray-300 py-3 px-4 rounded-lg text-center">
                <p className="text-sm">You've been invited to join SecretLobby!</p>
                <p className="text-xs text-gray-400 mt-1">Your account will be created with: {effectiveInviteEmail}</p>
              </div>
            )}

            {(signupError || urlError) && (
              <div className="mb-6 text-red-400 text-sm text-center bg-red-500/10 border border-red-700 py-3 px-4 rounded-lg">
                {signupError || urlError}
              </div>
            )}

            {googleEnabled && (
              <>
                <a
                  href={effectiveInviteCode ? `/auth/google?inviteCode=${effectiveInviteCode}` : "/auth/google"}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign up with Google
                </a>
                {hasInvite && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Use the same email address as your invitation: {effectiveInviteEmail}
                  </p>
                )}
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
              {effectiveInviteCode && <input type="hidden" name="inviteCode" value={effectiveInviteCode} />}

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="John Doe"
                  required
                  autoComplete="name"
                  defaultValue={effectiveInviteName || ""}
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
              </div>

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
                  defaultValue={effectiveInviteEmail || ""}
                  readOnly={hasInvite}
                  className={cn(
                    "w-full px-4 py-3 rounded-lg border text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent",
                    hasInvite
                      ? "bg-gray-800 border-gray-600 cursor-not-allowed"
                      : "bg-[#0a0a0a] border-gray-700"
                  )}
                />
                {hasInvite && (
                  <p className="text-xs text-gray-500 mt-1">
                    Email is locked to your invitation
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="accountName" className="block text-sm font-medium text-gray-300 mb-1">
                  Band/Organization Name
                </label>
                <input
                  type="text"
                  id="accountName"
                  name="accountName"
                  placeholder="My Awesome Band"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be used to create your lobby URL (e.g., my-awesome-band.secretlobby.local)
                </p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Re-enter your password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-gray-700 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={cn("w-full py-3 px-4 bg-[#ed1b2f] text-white font-semibold rounded-lg hover:bg-[#d4192a] focus:outline-none focus:ring-2 focus:ring-[#ed1b2f] focus:ring-offset-2 focus:ring-offset-[#1a1a1a] disabled:opacity-50 transition", {"cursor-pointer": !isSubmitting, "cursor-not-allowed": isSubmitting})}
              >
                {isSubmitting ? "Creating Account..." : "Create Account"}
              </button>
            </Form>

            <div className="mt-6 text-center text-sm text-gray-400">
              Already have an account?{" "}
              <a href="/login" className="text-[#ed1b2f] hover:text-[#ff3347] font-medium">
                Sign in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
