import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn, UserPlus, Eye, EyeOff, FileText, GitCompare, Bot, ShieldCheck, Sparkles } from "lucide-react";

import { useAuth } from "../auth/AuthContext";

const LOGIN_MODE = "login";
const REGISTER_MODE = "register";
const MIN_PASSWORD_LENGTH = 8;
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let googleIdentityScriptPromise = null;

function validateAuthForm(mode, form) {
  const email = form.email.trim();
  const displayName = form.displayName.trim();

  if (!email) {
    return "Email is required.";
  }

  if (mode === REGISTER_MODE && !displayName) {
    return "Display name is required.";
  }

  if (!form.password) {
    return "Password is required.";
  }

  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return "";
}

/* Input focus handler: Binance spec uses a black focus border. */
function handleInputFocus(e) { e.target.style.borderColor = "#000000"; }
function handleInputBlur(e) { e.target.style.borderColor = "#E6E8EA"; }

/* Input style: 8px radius, snow background, light border. */
const inputStyle = { borderRadius: "8px", outline: "none", transition: "border-color 200ms ease" };

function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google sign-in failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in failed to load."));
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

function GoogleSignInButton({ disabled = false, onCredential, onError }) {
  const clientId = getGoogleClientId();
  const initializedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!clientId) return undefined;

    let isCancelled = false;

    async function initGoogle() {
      try {
        await loadGoogleIdentityScript();
        if (isCancelled) return;

        const googleIdentity = window.google?.accounts?.id;
        if (!googleIdentity) {
          throw new Error("Google sign-in is not available.");
        }

        if (!initializedRef.current) {
          googleIdentity.initialize({
            client_id: clientId,
            callback: (response) => {
              if (response?.credential) {
                onCredential(response.credential);
                return;
              }
              onError("Google did not return a credential.");
            },
          });
          initializedRef.current = true;
        }

        if (!isCancelled) setIsReady(true);
      } catch (error) {
        if (!isCancelled) {
          onError(error.message || "Google sign-in failed to load.");
        }
      }
    }

    initGoogle();
    return () => { isCancelled = true; };
  }, [clientId, onCredential, onError]);

  if (!clientId) return null;

  function handleClick() {
    if (!isReady || disabled) return;
    const googleIdentity = window.google?.accounts?.id;
    if (googleIdentity) {
      googleIdentity.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          onError("Google sign-in popup was blocked. Please allow popups or try again.");
        }
      });
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || !isReady}
      onClick={handleClick}
      className="h-11 w-full flex items-center justify-center gap-2.5 border border-[#E6E8EA] bg-white text-[14px] font-semibold text-[#1E2026] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        borderRadius: "6px",
        transition: "all 200ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled && isReady) {
          e.currentTarget.style.background = "#F5F5F5";
          e.currentTarget.style.borderColor = "#D0D5DD";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#FFFFFF";
        e.currentTarget.style.borderColor = "#E6E8EA";
      }}
    >
      <svg height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      Continue with Google
    </button>
  );
}

/* Left panel brand/features on the dark section. */
function BrandPanel() {
  const features = [
    { icon: FileText, title: "Smart Contract Parsing", desc: "Upload DOCX or PDF contracts, extract clauses, tables, and footnotes with full structure preservation." },
    { icon: GitCompare, title: "Deterministic Compare", desc: "Detect every clause change - Added, Removed, Modified - with zero AI guesswork." },
    { icon: Bot, title: "AI-Powered Review", desc: "Get risk assessments, explanations, and suggestions powered by RAG technology." },
    { icon: ShieldCheck, title: "Human-First Decisions", desc: "AI suggests, you decide. Every review is confirmed by a real reviewer." },
  ];

  return (
    <div
      className="hidden lg:flex lg:w-[52%] relative overflow-hidden"
      style={{ background: "#222126" }}
    >
      {/* Subtle gold glow, restrained per spec. */}
      <div
        className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(240,185,11,0.08) 0%, transparent 70%)", filter: "blur(80px)" }}
      />

      <div className="relative z-10 flex flex-col justify-center px-16 py-12 w-full">
        {/* Logo: 6px radius per spec. */}
        <div className="flex items-center gap-3 mb-12">
          <div
            className="w-10 h-10 bg-[#F0B90B] flex items-center justify-center text-[#1E2026] font-bold text-lg"
            style={{ borderRadius: "6px" }}
          >R</div>
          <span className="text-white text-xl font-bold tracking-tight">Redline</span>
        </div>

        {/* Display headline. */}
        <h1 className="text-4xl font-bold text-white mb-4" style={{ lineHeight: "1.08" }}>
          Contract Review,<br />
          <span className="text-[#F0B90B]">Reimagined.</span>
        </h1>
        <p className="text-[16px] font-medium text-[#848E9C] mb-10 max-w-[420px]" style={{ lineHeight: "1.50" }}>
          The AI-powered platform that turns hours of manual contract review into minutes of focused decision-making.
        </p>

        {/* Feature list: gold only. */}
        <div className="flex flex-col gap-5">
          {features.map((f) => (
            <div className="flex items-start gap-3.5 group" key={f.title}>
              <div
                className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                style={{
                  borderRadius: "8px",
                  background: "rgba(240, 185, 11, 0.1)",
                  border: "1px solid rgba(240, 185, 11, 0.15)",
                  transition: "background 200ms ease",
                }}
              >
                <f.icon size={16} className="text-[#F0B90B]" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-white mb-0.5" style={{ lineHeight: "1.43" }}>{f.title}</p>
                <p className="text-[12px] font-medium text-[#848E9C]" style={{ lineHeight: "1.50" }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom badge: pill radius. */}
        <div className="mt-auto pt-10">
          <div
            className="flex items-center gap-2 px-3 py-2 w-fit"
            style={{
              borderRadius: "50px",
              background: "rgba(240, 185, 11, 0.1)",
              border: "1px solid rgba(240, 185, 11, 0.15)",
            }}
          >
            <Sparkles size={12} className="text-[#F0B90B]" />
            <span className="text-[11px] text-[#F0B90B] font-medium">Trusted by legal teams worldwide</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Auth Page */
export function AuthPage() {
  const { isAuthenticated, isAuthReady, login, loginWithGoogle, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(LOGIN_MODE);
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    password: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const nextPath = typeof location.state?.from === "string" ? location.state.from : "/dashboard";

  const handleGoogleCredential = useCallback(async (credential) => {
    setError("");
    setIsSubmitting(true);

    try {
      await loginWithGoogle(credential);
      startTransition(() => {
        navigate(nextPath, { replace: true });
      });
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [loginWithGoogle, navigate, nextPath]);

  const handleGoogleError = useCallback((message) => {
    setError(message);
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-12 h-12 bg-[#F0B90B] flex items-center justify-center text-[#1E2026] font-bold text-xl animate-pulse"
            style={{ borderRadius: "6px" }}
          >R</div>
          <p className="text-[14px] text-[#848E9C] font-medium">Securing your workspace...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate replace to={nextPath} />;
  }

  const isRegisterMode = mode === REGISTER_MODE;

  function updateField(fieldName, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [fieldName]: value
    }));
  }

  function switchMode(newMode) {
    setError("");
    setMode(newMode);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateAuthForm(mode, form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      if (isRegisterMode) {
        await register({
          email: form.email.trim(),
          display_name: form.displayName.trim(),
          password: form.password
        });
      } else {
        await login({
          email: form.email.trim(),
          password: form.password
        });
      }

      startTransition(() => {
        navigate(nextPath, { replace: true });
      });
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const titles = {
    [LOGIN_MODE]: { heading: "Sign In", sub: "Access your Redline contract review workspace" },
    [REGISTER_MODE]: { heading: "Create Account", sub: "Start reviewing contracts smarter today" },
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel. */}
      <BrandPanel />

      {/* Right auth panel. */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative bg-[#F5F5F5]">
        {/* Mobile logo (hidden on desktop) */}
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <div
            className="w-9 h-9 bg-[#F0B90B] flex items-center justify-center text-[#1E2026] font-bold text-base"
            style={{ borderRadius: "6px" }}
          >R</div>
          <span className="text-[#1E2026] text-lg font-bold">Redline</span>
        </div>

        {/* Auth card. */}
        <div className="w-full max-w-[400px]">
          <div
            className="bg-white border border-[#E6E8EA] p-8"
            style={{
              borderRadius: "12px",
              boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px",
            }}
          >
            {/* Header. */}
            <div className="mb-6">
              <h1 className="text-[24px] font-bold text-[#1E2026] mb-1" style={{ lineHeight: "1.00" }}>{titles[mode].heading}</h1>
              <p className="text-[14px] font-medium text-[#848E9C]" style={{ lineHeight: "1.43" }}>{titles[mode].sub}</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Email. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider" htmlFor="auth-email">Email address</label>
                <input
                  className="h-11 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C]"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  id="auth-email"
                  name="email"
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="name@company.com"
                  required
                  type="email"
                  value={form.email}
                />
              </div>

              {/* Display Name (register only) */}
              {isRegisterMode && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider" htmlFor="auth-display-name">Display Name</label>
                  <input
                    className="h-11 px-3 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C]"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    id="auth-display-name"
                    name="displayName"
                    onChange={(event) => updateField("displayName", event.target.value)}
                    placeholder="Your full name"
                    required
                    type="text"
                    value={form.displayName}
                  />
                </div>
              )}

              {/* Password. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider" htmlFor="auth-password">Password</label>
                <div className="relative">
                  <input
                    className="h-11 w-full px-3 pr-11 bg-[#F5F5F5] border border-[#E6E8EA] text-[14px] font-medium text-[#1E2026] placeholder-[#848E9C]"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    id="auth-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    name="password"
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-[#848E9C] cursor-pointer p-0 flex items-center"
                    style={{ transition: "color 200ms ease" }}
                    onMouseEnter={(e) => { e.target.style.color = "#1A1A1A"; }}
                    onMouseLeave={(e) => { e.target.style.color = "#848E9C"; }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Error. */}
              {error && (
                <div
                  className="flex items-center gap-2.5 p-3 border border-[#F6465D]"
                  style={{ borderRadius: "8px", background: "rgba(246, 70, 93, 0.05)" }}
                  role="alert"
                >
                  <div className="w-1 h-4 bg-[#F6465D] flex-shrink-0" style={{ borderRadius: "2px" }} />
                  <p className="text-[12px] text-[#F6465D] font-semibold">{error}</p>
                </div>
              )}

              {/* Submit button. */}
              <button
                className="h-11 w-full font-semibold text-[16px] flex items-center justify-center gap-2 border-none cursor-pointer disabled:bg-[#E6E8EA] disabled:text-[#848E9C] disabled:cursor-not-allowed"
                disabled={isSubmitting}
                type="submit"
                style={{
                  borderRadius: "6px",
                  background: isSubmitting ? "#D0980B" : "#F0B90B",
                  color: "#1E2026",
                  transition: "background 200ms ease",
                  letterSpacing: "0.16px",
                }}
              >
                {isSubmitting ? (
                  "Please wait..."
                ) : isRegisterMode ? (
                  <><UserPlus size={16} /> Create Account</>
                ) : (
                  <><LogIn size={16} /> Sign In</>
                )}
              </button>
            </form>

            {/* Divider between email/password sign-in and Google */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[#E6E8EA]" />
              <span className="text-[12px] text-[#848E9C] font-medium">or</span>
              <div className="flex-1 h-px bg-[#E6E8EA]" />
            </div>

            {/* Google Sign In */}
            <GoogleSignInButton
              disabled={isSubmitting}
              onCredential={handleGoogleCredential}
              onError={handleGoogleError}
            />

            {/* Mode toggle */}
            <div className="text-center mt-6">
              {isRegisterMode ? (
                <button
                  className="text-[14px] text-[#32313A] bg-transparent border-none cursor-pointer font-medium"
                  style={{ transition: "color 200ms ease" }}
                  onMouseEnter={(e) => { e.target.style.color = "#1A1A1A"; }}
                  onMouseLeave={(e) => { e.target.style.color = "#32313A"; }}
                  onClick={() => switchMode(LOGIN_MODE)}
                  type="button"
                >
                  Already have an account? <span className="font-semibold text-[#F0B90B]">Sign In</span>
                </button>
              ) : (
                <button
                  className="text-[14px] text-[#32313A] bg-transparent border-none cursor-pointer font-medium"
                  style={{ transition: "color 200ms ease" }}
                  onMouseEnter={(e) => { e.target.style.color = "#1A1A1A"; }}
                  onMouseLeave={(e) => { e.target.style.color = "#32313A"; }}
                  onClick={() => switchMode(REGISTER_MODE)}
                  type="button"
                >
                  No account? <span className="font-semibold text-[#F0B90B]">Create one</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <a
              className="text-[12px] text-[#848E9C] font-medium no-underline"
              style={{ transition: "color 200ms ease" }}
              onMouseEnter={(e) => { e.target.style.color = "#1A1A1A"; }}
              onMouseLeave={(e) => { e.target.style.color = "#848E9C"; }}
              href="#"
            >Privacy Policy</a>
            <span className="text-[12px] text-[#E6E8EA]">/</span>
            <a
              className="text-[12px] text-[#848E9C] font-medium no-underline"
              style={{ transition: "color 200ms ease" }}
              onMouseEnter={(e) => { e.target.style.color = "#1A1A1A"; }}
              onMouseLeave={(e) => { e.target.style.color = "#848E9C"; }}
              href="#"
            >Terms of Service</a>
          </div>
        </div>
      </div>
    </div>
  );
}
