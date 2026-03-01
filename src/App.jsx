import { useState, useEffect, useRef, useCallback } from "react";

// ─── Firebase (optional — app works without it, login upgrades when configured)
// To enable: npm install firebase, create src/firebase.js with your config,
// then uncomment the import below:
// import { auth, googleProvider } from "./firebase";
// import { signInWithPopup, signInWithEmailAndPassword,
//          createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
const auth = null; // replace with real auth when Firebase is configured
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";

// ─── Utility helpers ─────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── User-scoped storage ─────────────────────────────────────────────────────
// currentUser is set at login; all keys are prefixed with the username
let _currentUser = null;
const scopedKey = (key) => _currentUser ? `ff_user_${_currentUser}_${key}` : key;

function useLocalStorage(key, init) {
  const scoped = scopedKey(key);
  const [val, setVal] = useState(() => {
    try {
      const s = localStorage.getItem(scoped);
      return s ? JSON.parse(s) : init;
    } catch { return init; }
  });
  const set = useCallback((v) => {
    setVal((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      localStorage.setItem(scopedKey(key), JSON.stringify(next));
      return next;
    });
  }, [key]);
  return [val, set];
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("signin");          // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const firebaseReady = !!auth;

  // ── Local fallback (no Firebase) ─────────────────────────────────────────
  const knownUsers = (() => {
    try { return JSON.parse(localStorage.getItem("ff_users") || "[]"); } catch { return []; }
  })();

  const localLogin = (username) => {
    const cleaned = (username || email).trim().toLowerCase().replace(/[^a-z0-9_.@]/g, "").replace(/@.*/, "").slice(0, 24) || "user";
    const users = JSON.parse(localStorage.getItem("ff_users") || "[]");
    if (!users.includes(cleaned)) localStorage.setItem("ff_users", JSON.stringify([...users, cleaned]));
    onLogin({ uid: cleaned, displayName: cleaned, email: email || cleaned, photo: null, provider: "local" });
  };

  // ── Email / Password ──────────────────────────────────────────────────────
  const handleEmailAuth = async () => {
    setError(""); setSuccess("");
    if (!email.trim() || !password.trim()) { setError("Please fill in all fields."); return; }
    if (!firebaseReady) { localLogin(); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(cred.user, { displayName });
        onLogin({ uid: cred.user.uid, displayName: displayName || email.split("@")[0], email: cred.user.email, photo: cred.user.photoURL, provider: "email" });
      } else {
        const { signInWithEmailAndPassword } = await import("firebase/auth");
        const cred = await signInWithEmailAndPassword(auth, email, password);
        onLogin({ uid: cred.user.uid, displayName: cred.user.displayName || email.split("@")[0], email: cred.user.email, photo: cred.user.photoURL, provider: "email" });
      }
    } catch (e) {
      const msgs = {
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/invalid-credential": "Email or password is incorrect.",
      };
      setError(msgs[e.code] || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  // ── Google Sign In ────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError("");
    if (!firebaseReady) { localLogin(); return; }
    setLoading(true);
    try {
      const { signInWithPopup, GoogleAuthProvider } = await import("firebase/auth");
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/calendar");
      const cred = await signInWithPopup(auth, provider);
      onLogin({ uid: cred.user.uid, displayName: cred.user.displayName || cred.user.email.split("@")[0], email: cred.user.email, photo: cred.user.photoURL, provider: "google" });
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") setError("Google sign-in failed. Please try again.");
    }
    setLoading(false);
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    if (!firebaseReady) { setError("Password reset requires Firebase setup."); return; }
    try {
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(auth, email);
      setSuccess("Password reset email sent! Check your inbox.");
      setError("");
    } catch { setError("Could not send reset email. Check the address and try again."); }
  };

  const divider = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 12, color: C.textMuted }}>or</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 16,
    }}>
      {/* Background glow */}
      <div style={{ position: "fixed", top: "15%", left: "50%", transform: "translateX(-50%)", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,92,252,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "10%", right: "10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(239,68,68,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 420, background: C.surface, borderRadius: 24, border: `1px solid ${C.border}`, boxShadow: "0 32px 80px rgba(0,0,0,0.6)", padding: "40px 36px", position: "relative" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: "linear-gradient(135deg,#7c5cfc,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 14px", boxShadow: "0 8px 24px rgba(124,92,252,0.3)" }}>🍅</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>FocusFlow</h1>
          <p style={{ color: C.textMuted, fontSize: 13, marginTop: 6 }}>Study smarter. Score higher.</p>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", background: C.surfaceAlt, borderRadius: 10, padding: 3, marginBottom: 24, gap: 2 }}>
          {[["signin","Sign In"],["signup","Create Account"]].map(([m, l]) => (
            <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: mode === m ? C.accent : "transparent",
                color: mode === m ? "#fff" : C.textMuted, transition: "all 0.15s" }}>
              {l}
            </button>
          ))}
        </div>

        {/* Google button */}
        <button onClick={handleGoogle} disabled={loading}
          style={{ width: "100%", padding: "11px 16px", borderRadius: 12, border: `1px solid ${C.border}`,
            background: C.surfaceAlt, color: C.text, cursor: loading ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            fontSize: 14, fontWeight: 600, transition: "all 0.15s",
            opacity: loading ? 0.7 : 1,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#5f5f5f"}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >
          {/* Google G logo */}
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {divider}

        {/* Email form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <div>
              <label style={labelStyle()}>Display Name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name (e.g. Andrea)"
                style={{ ...inputStyle(), padding: "10px 12px" }} />
            </div>
          )}

          <div>
            <label style={labelStyle()}>Email Address</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleEmailAuth()}
              placeholder="you@example.com"
              style={{ ...inputStyle(), padding: "10px 12px" }}
              autoFocus={!firebaseReady} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={labelStyle()}>Password</label>
              {mode === "signin" && (
                <button onClick={handleForgotPassword}
                  style={{ background: "none", border: "none", fontSize: 11, color: C.accent, cursor: "pointer", padding: 0 }}>
                  Forgot password?
                </button>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleEmailAuth()}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                style={{ ...inputStyle(), padding: "10px 40px 10px 12px", width: "100%" }} />
              <button onClick={() => setShowPw(s => !s)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14 }}>
                {showPw ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Error / success */}
          {error && <div style={{ fontSize: 12, color: C.danger, padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)" }}>{error}</div>}
          {success && <div style={{ fontSize: 12, color: C.success, padding: "8px 12px", background: "rgba(74,222,128,0.1)", borderRadius: 8, border: "1px solid rgba(74,222,128,0.2)" }}>{success}</div>}

          <button onClick={handleEmailAuth} disabled={loading}
            style={{ ...btnStyle("primary"), width: "100%", padding: "12px", fontSize: 14, borderRadius: 12, marginTop: 4, opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Please wait..." : mode === "signup" ? "Create Account →" : "Sign In →"}
          </button>
        </div>

        {/* Firebase not set up notice */}
        {!firebaseReady && (
          <div style={{ marginTop: 20, padding: "10px 14px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, fontSize: 12, color: "#fbbf24", lineHeight: 1.5 }}>
            ⚙️ <strong>Firebase not connected yet.</strong> You can still use the app — accounts are saved locally on this device. Follow your launch checklist to enable real accounts and Google Login.
          </div>
        )}

        {/* Existing local accounts quick-switch */}
        {!firebaseReady && knownUsers.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, textAlign: "center" }}>— existing accounts on this device —</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {knownUsers.map(u => (
                <button key={u} onClick={() => localLogin(u)}
                  style={{ padding: "6px 14px", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 20, cursor: "pointer", color: C.text, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.accentSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.accent, fontWeight: 700 }}>
                    {u[0].toUpperCase()}
                  </span>
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PRIORITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["Backlog", "Planned", "In Progress", "Done"];
const TASK_TYPES = ["homework", "project", "test", "quiz", "reading", "other"];
const PROJECT_COLORS = ["#7c5cfc","#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#ec4899","#a855f7","#14b8a6"];

// ── Task Context Types ────────────────────────────────────────────────────────
const TASK_CONTEXTS = [
  { id: "academic",  label: "Academic",  icon: "📚", color: "#3b82f6", desc: "Courses with grade weights" },
  { id: "examprep",  label: "Exam Prep", icon: "🧬", color: "#8b5cf6", desc: "MCAT, CCMA, certifications" },
  { id: "project",   label: "Project",   icon: "📁", color: "#f97316", desc: "App building, Etsy, long-term work" },
  { id: "work",      label: "Work",      icon: "💼", color: "#06b6d4", desc: "Teaching, job tasks — someone is waiting" },
  { id: "personal",  label: "Personal",  icon: "🏠", color: "#22c55e", desc: "Life admin, health, errands" },
];

// ── StudyCal Priority Formula ─────────────────────────────────────────────────
// Priority = (3×U) + (2×I) + (2×D) + (1.5×S) + (2×B)
// U = Urgency      — auto from due date  (1-5)
// I = Impact       — grade% ÷ 10 (academic) OR self-rated 1-5
// D = Difficulty   — self-rated 1-5, updated by reflections
// S = Stress       — self-rated 1-5, updated by reflections
// B = Buffer Deficit — max(0, plannedHours - completedHours)

function calcUrgency(dueDate) {
  if (!dueDate) return 3;
  const days = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
  if (days <= 0) return 5;
  if (days === 1) return 5;
  if (days <= 2) return 4;
  if (days <= 4) return 3;
  if (days <= 6) return 2;
  return 1;
}

function calcImpact(task) {
  if (task.context === "academic" && task.assignmentWeight != null) {
    return Math.min(5, +(task.assignmentWeight / 10).toFixed(2));
  }
  return task.impactRating || 3;
}

function calcBufferDeficit(task) {
  const planned = task.plannedHours || 0;
  const completed = task.completedHours || 0;
  return Math.max(0, planned - completed);
}

function calcStudyCalScore(task) {
  const U = calcUrgency(task.dueDate);
  const I = calcImpact(task);
  const D = task.difficulty || 3;
  const S = task.stress || 3;
  const B = calcBufferDeficit(task);
  const score = (3 * U) + (2 * I) + (2 * D) + (1.5 * S) + (2 * B);
  return +score.toFixed(1);
}

function priorityLabel(score) {
  if (score >= 25) return { label: "Critical",    color: "#ef4444" };
  if (score >= 18) return { label: "Study First", color: "#f97316" };
  if (score >= 12) return { label: "Review Soon", color: "#fbbf24" };
  return               { label: "On Track",    color: "#4ade80" };
}

// Legacy — kept for backwards compat
function calcImpactLegacy(importance = 3, urgency = 3, effort = 3) {
  return +(( importance * urgency) / Math.max(effort, 0.1)).toFixed(1);
}

const C = {
  bg: "#0f0f13", surface: "#18181f", surfaceAlt: "#1e1e27", border: "#2a2a38",
  accent: "#7c5cfc", accentHover: "#9478fd", accentSoft: "rgba(124,92,252,0.15)",
  text: "#e8e6f0", textMuted: "#7a7890", textDim: "#4a4860",
  success: "#4ade80", warning: "#fbbf24", danger: "#f87171",
  tomato: "#ef4444", tomatoSoft: "rgba(239,68,68,0.15)",
};

// ─── Shared UI ───────────────────────────────────────────────────────────────
const labelStyle = () => ({ fontSize: 12, color: C.textMuted, marginBottom: 4, display: "block" });
const inputStyle = () => ({
  width: "100%", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14,
  outline: "none", boxSizing: "border-box",
});
const btnStyle = (variant) => ({
  primary:   { padding: "8px 16px", background: C.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  secondary: { padding: "8px 14px", background: C.surfaceAlt, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: 13 },
  danger:    { padding: "8px 14px", background: C.tomatoSoft, color: C.tomato, border: `1px solid ${C.tomato}`, borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
}[variant]);

function Card({ children, style }) {
  return <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>;
}
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 560, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Input({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      {label && <label style={labelStyle()}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={inputStyle()} />
    </div>
  );
}
function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
    </div>
  );
}
function StatCard({ label, value, icon, color }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: color || C.text }}>{value}</div>
    </Card>
  );
}
function SliderSetting({ label, value, min, max, unit, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
        <span>{label}</span>
        <span style={{ color: C.accent, fontWeight: 600 }}>{value}{unit ? " " + unit : ""}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.accent }} />
    </div>
  );
}

// ─── StudyCal Score Badge ─────────────────────────────────────────────────────
function ScoreBadge({ task, size = "sm" }) {
  const score = calcStudyCalScore(task);
  const { label, color } = priorityLabel(score);
  const isLg = size === "lg";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: isLg ? 6 : 4,
      padding: isLg ? "5px 12px" : "3px 8px",
      borderRadius: 20, border: `1px solid ${color}`,
      background: `${color}18`,
    }}>
      <span style={{ width: isLg ? 8 : 6, height: isLg ? 8 : 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: isLg ? 13 : 11, fontWeight: 700, color }}>{score}</span>
      <span style={{ fontSize: isLg ? 12 : 10, color, opacity: 0.85 }}>{label}</span>
    </div>
  );
}

// ── Slider row helper ─────────────────────────────────────────────────────────
function SliderRow({ label, value, onChange, min = 1, max = 5, low = "", high = "", color }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: color || C.accent }}>{value}/5</span>
      </div>
      <input type="range" min={min} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color || C.accent }} />
      {(low || high) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim, marginTop: 2 }}>
          <span>{low}</span><span>{high}</span>
        </div>
      )}
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({ projects, onSave, onClose, existing }) {
  // Step 1 — pick context, Step 2 — fill details
  const [step, setStep] = useState(existing ? "form" : "context");
  const [expanded, setExpanded] = useState(false);

  const defaultForm = {
    title: "", description: "", status: "Planned", dueDate: "", scheduledDate: "",
    estimatedPomos: 2, projectId: "",
    // StudyCal fields
    context: "academic",
    difficulty: 3, stress: 3,
    plannedHours: 2, completedHours: 0,
    // Academic
    className: "", assignmentWeight: 20,
    // Exam Prep / Project / Work / Personal
    impactRating: 3,
    examName: "", projectName: "", role: "", lifeArea: "",
  };

  const [form, setForm] = useState(existing || defaultForm);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const ctx = TASK_CONTEXTS.find(c => c.id === form.context) || TASK_CONTEXTS[0];
  const score = calcStudyCalScore(form);
  const { label, color } = priorityLabel(score);

  const contextFields = () => {
    switch (form.context) {
      case "academic": return (
        <>
          <Input label="Course Name" placeholder="e.g. Biology 101" value={form.className} onChange={v => set("className", v)} />
          <div>
            <label style={labelStyle()}>Assignment Weight %</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={0} max={100} value={form.assignmentWeight}
                onChange={e => set("assignmentWeight", Number(e.target.value))}
                style={{ ...inputStyle(), width: 80 }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>
                → Impact = {(form.assignmentWeight / 10).toFixed(1)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              e.g. 25% midterm = 2.5 · 5% quiz = 0.5 · 40% final = 4.0
            </div>
          </div>
        </>
      );
      case "examprep": return (
        <>
          <Input label="Exam Name" placeholder="e.g. MCAT, CCMA, Bar Exam" value={form.examName} onChange={v => set("examName", v)} />
          <SliderRow label="Foundational Importance" value={form.impactRating} onChange={v => set("impactRating", v)}
            low="Nice to know" high="Must master" color="#8b5cf6" />
        </>
      );
      case "project": return (
        <>
          <Input label="Project Name" placeholder="e.g. FocusFlow, Etsy Shop" value={form.projectName} onChange={v => set("projectName", v)} />
          <SliderRow label="Outcome Importance" value={form.impactRating} onChange={v => set("impactRating", v)}
            low="Low stakes" high="Career defining" color="#f97316" />
        </>
      );
      case "work": return (
        <>
          <Input label="Role / Employer" placeholder="e.g. Teaching, CCMA" value={form.role} onChange={v => set("role", v)} />
          <SliderRow label="Professional Consequence" value={form.impactRating} onChange={v => set("impactRating", v)}
            low="Minor" high="Critical" color="#06b6d4" />
        </>
      );
      case "personal": return (
        <>
          <Input label="Life Area" placeholder="e.g. Health, Family, Admin" value={form.lifeArea} onChange={v => set("lifeArea", v)} />
          <SliderRow label="Life Priority" value={form.impactRating} onChange={v => set("impactRating", v)}
            low="Can wait" high="Must do" color="#22c55e" />
        </>
      );
      default: return null;
    }
  };

  // Step 1 — Context picker
  if (step === "context") return (
    <Modal title="New Task — What type?" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {TASK_CONTEXTS.map(c => (
          <button key={c.id} onClick={() => { set("context", c.id); setStep("form"); }}
            style={{
              padding: "16px 14px", borderRadius: 12, border: `2px solid ${form.context === c.id ? c.color : C.border}`,
              background: C.surfaceAlt, cursor: "pointer", textAlign: "left", transition: "all 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = c.color}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3 }}>{c.label}</div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>{c.desc}</div>
          </button>
        ))}
      </div>
    </Modal>
  );

  // Step 2 — Form
  return (
    <Modal title={`${ctx.icon} ${existing ? "Edit" : "New"} ${ctx.label} Task`} onClose={onClose}>

      {/* Live score preview */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: `${color}12`, border: `1px solid ${color}30`, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>StudyCal Priority Score</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{score}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}20`, padding: "2px 10px", borderRadius: 20 }}>{label}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Always visible — core fields */}
        <Input label="Title *" value={form.title} onChange={v => set("title", v)} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Due Date" type="date" value={form.dueDate} onChange={v => set("dueDate", v)} />
          <div>
            <label style={labelStyle()}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={inputStyle()}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Context-specific fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {contextFields()}
        </div>

        <SliderRow label="Difficulty" value={form.difficulty} onChange={v => set("difficulty", v)}
          low="Very easy" high="Very hard"
          color={form.difficulty >= 4 ? "#ef4444" : form.difficulty >= 3 ? "#fbbf24" : "#4ade80"} />

        <SliderRow label="Stress Level" value={form.stress} onChange={v => set("stress", v)}
          low="No pressure" high="Very anxious"
          color={form.stress >= 4 ? "#ef4444" : form.stress >= 3 ? "#fbbf24" : "#4ade80"} />

        {/* Expand button */}
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.textMuted, fontSize: 12, textAlign: "left" }}>
          {expanded ? "▲ Hide advanced fields" : "▼ Show advanced fields (hours, pomodoros, project)"}
        </button>

        {expanded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0 4px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle()}>Planned Hours</label>
                <input type="number" min={0} step={0.5} value={form.plannedHours}
                  onChange={e => set("plannedHours", Number(e.target.value))}
                  style={inputStyle()} />
              </div>
              <div>
                <label style={labelStyle()}>Completed Hours</label>
                <input type="number" min={0} step={0.5} value={form.completedHours}
                  onChange={e => set("completedHours", Number(e.target.value))}
                  style={inputStyle()} />
              </div>
              <Input label="Est. Pomodoros" type="number" value={form.estimatedPomos} onChange={v => set("estimatedPomos", Number(v))} />
              <Input label="Scheduled Date" type="date" value={form.scheduledDate} onChange={v => set("scheduledDate", v)} />
            </div>
            {projects.length > 0 && (
              <div>
                <label style={labelStyle()}>Project</label>
                <select value={form.projectId} onChange={e => set("projectId", e.target.value)} style={inputStyle()}>
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <Input label="Description / Notes" value={form.description} onChange={v => set("description", v)} />

            {/* Buffer deficit live indicator */}
            {form.plannedHours > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: calcBufferDeficit(form) > 0 ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)", border: `1px solid ${calcBufferDeficit(form) > 0 ? "#f87171" : "#4ade80"}` }}>
                <span style={{ fontSize: 12, color: calcBufferDeficit(form) > 0 ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                  {calcBufferDeficit(form) > 0
                    ? `⚠️ ${calcBufferDeficit(form).toFixed(1)} hrs behind schedule — Buffer Deficit adds +${(calcBufferDeficit(form) * 2).toFixed(1)} to priority`
                    : `✅ On schedule — no buffer deficit`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {!existing && <button onClick={() => setStep("context")} style={{ ...btnStyle("secondary"), padding: "10px 14px" }}>← Back</button>}
        <button onClick={onClose} style={{ ...btnStyle("secondary"), flex: 1 }}>Cancel</button>
        <button onClick={() => { if (form.title) onSave({ ...form, studyCalScore: calcStudyCalScore(form) }); }}
          style={{ ...btnStyle("primary"), flex: 2 }}>
          {existing ? "Update Task" : "Create Task"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Pomodoro Timer ───────────────────────────────────────────────────────────
function PomodoroPanel({ timerState, setTimerState, startTimer, stopTimer, resetTimer, settings, activeTask, addReflection }) {
  const { remaining, mode, running, sessionCount } = timerState;
  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");
  const total = mode === "focus" ? settings.focusDuration * 60 : mode === "shortBreak" ? settings.shortBreak * 60 : settings.longBreak * 60;
  const progress = 1 - remaining / total;
  const r = 54, circ = 2 * Math.PI * r;
  const modeLabels = { focus: "Focus", shortBreak: "Short Break", longBreak: "Long Break" };
  const modeColors = { focus: C.tomato, shortBreak: C.success, longBreak: C.accent };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontWeight: 600 }}>
        <span>🍅</span> Pomodoro Timer
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", marginBottom: 14 }}>
        {Object.entries(modeLabels).map(([m, l]) => (
          <button key={m}
            onClick={() => setTimerState(s => ({
              ...s, mode: m, running: false,
              remaining: m === "focus" ? settings.focusDuration * 60 : m === "shortBreak" ? settings.shortBreak * 60 : settings.longBreak * 60
            }))}
            style={{ padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: mode === m ? modeColors[m] : C.border, color: mode === m ? "#fff" : C.textMuted }}
          >{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div style={{ position: "relative", width: 120, height: 120 }}>
          <svg width="120" height="120" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="60" cy="60" r={r} fill="none" stroke={C.border} strokeWidth="6" />
            <circle cx="60" cy="60" r={r} fill="none" stroke={modeColors[mode]} strokeWidth="6"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{mins}:{secs}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>{modeLabels[mode]}</div>
          </div>
        </div>
      </div>
      {activeTask && <div style={{ textAlign: "center", marginBottom: 10, fontSize: 12, color: C.accent }}>▶ {activeTask.title}</div>}
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        <button onClick={resetTimer} style={btnStyle("secondary")}>↺ Reset</button>
        {running
          ? <button onClick={stopTimer} style={btnStyle("danger")}>⬛ Stop</button>
          : <button onClick={startTimer} style={btnStyle("primary")}>▶ Start</button>}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 12, alignItems: "center" }}>
        {Array.from({ length: settings.pomosUntilLong }).map((_, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < (sessionCount % settings.pomosUntilLong) ? C.tomato : C.border }} />
        ))}
        <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>#{sessionCount + 1}</span>
      </div>
    </Card>
  );
}

// ─── AI Advisor ───────────────────────────────────────────────────────────────
function AIAdvisor({ tasks, timerState }) {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);

  const getAdvice = async () => {
    setLoading(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "You are a friendly, concise student productivity coach. Give practical, motivating advice in 2-3 sentences. Be specific to the student's situation.",
          messages: [{ role: "user", content: `I'm a student using Pomodoro. I have ${tasks.length} tasks today, ${tasks.filter(t=>t.status==="Done").length} done, ${timerState.sessionCount} focus sessions completed. Tasks: ${tasks.slice(0,5).map(t=>t.title).join(", ") || "none yet"}. Give me a quick, specific productivity tip.` }]
        })
      });
      const data = await resp.json();
      setAdvice(data.content?.[0]?.text || "Keep up the great work! Focus on one task at a time.");
    } catch {
      setAdvice("Stay focused and take regular breaks. Tackle your most challenging task first while your energy is highest!");
    }
    setLoading(false);
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#7c5cfc,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>AI Study Advisor</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Personalized guidance</div>
          </div>
        </div>
        <button onClick={getAdvice} disabled={loading} style={btnStyle("primary")}>
          {loading ? "Thinking…" : "✦ Get Advice"}
        </button>
      </div>
      {advice
        ? <div style={{ fontSize: 14, lineHeight: 1.65, padding: 14, background: C.accentSoft, borderRadius: 8, border: `1px solid ${C.border}` }}>{advice}</div>
        : <div style={{ textAlign: "center", color: C.textDim, padding: "24px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✦</div>
            Click the button to get AI-powered study advice
          </div>
      }
    </Card>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
function KanbanColumn({ status, items, onDrop, setDragging, updateTask, deleteTask, setTimerActiveTask, activeTaskId }) {
  const [over, setOver] = useState(false);
  const colors = { Backlog: C.textDim, Planned: C.accent, "In Progress": C.warning, Done: C.success };
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={() => { onDrop(); setOver(false); }}
      style={{ background: over ? C.accentSoft : C.surfaceAlt, borderRadius: 12, padding: 12, minHeight: 200, border: `1px solid ${over ? C.accent : C.border}`, transition: "all 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[status] }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{status}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, background: C.border, padding: "2px 6px", borderRadius: 4 }}>{items.length}</span>
      </div>
      {items.map(task => {
        const pColors = { low: "#4ade80", medium: "#fbbf24", high: "#f97316", critical: "#ef4444" };
        const isActive = task.id === activeTaskId;
        return (
          <div key={task.id} draggable onDragStart={() => setDragging(task.id)}
            style={{ background: isActive ? "rgba(124,92,252,0.12)" : C.surface, border: `1px solid ${isActive ? C.accent : C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, cursor: "grab", transition: "all 0.15s" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: pColors[task.priority||"medium"], marginTop: 5, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{task.title}</span>
            </div>
            {task.className && <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>📚 {task.className}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {task.dueDate && <span style={{ fontSize: 11, color: C.textMuted }}>📅 {formatDate(task.dueDate)}</span>}
              {task.estimatedPomos && <span style={{ fontSize: 11, color: C.tomato }}>🍅 {task.pomodoros||0}/{task.estimatedPomos}</span>}
              {task.impactScore && <span style={{ fontSize: 11, color: C.accent }}>↗ {task.impactScore}</span>}
              <button onClick={() => setTimerActiveTask(task.id)}
                style={{ marginLeft: "auto", background: isActive ? C.accent : C.border, border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 11, cursor: "pointer", color: isActive ? "#fff" : C.textMuted }}>
                {isActive ? "▶ Active" : "▷"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Root: login gate ─────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("ff_active_user_v2");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Listen for Firebase auth state changes if Firebase is connected
  useEffect(() => {
    if (!auth) return;
    const tryListen = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth");
        return onAuthStateChanged(auth, (fbUser) => {
          if (fbUser) {
            const u = { uid: fbUser.uid, displayName: fbUser.displayName || fbUser.email.split("@")[0], email: fbUser.email, photo: fbUser.photoURL, provider: fbUser.providerData[0]?.providerId || "email" };
            _currentUser = u.uid;
            localStorage.setItem("ff_active_user_v2", JSON.stringify(u));
            setUser(u);
          } else {
            _currentUser = null;
            localStorage.removeItem("ff_active_user_v2");
            setUser(null);
          }
        });
      } catch { return () => {}; }
    };
    let unsub;
    tryListen().then(fn => { unsub = fn; });
    return () => unsub && unsub();
  }, []);

  const handleLogin = (userObj) => {
    _currentUser = userObj.uid;
    localStorage.setItem("ff_active_user_v2", JSON.stringify(userObj));
    // Also keep legacy list for local mode
    const users = JSON.parse(localStorage.getItem("ff_users") || "[]");
    if (!users.includes(userObj.uid)) localStorage.setItem("ff_users", JSON.stringify([...users, userObj.uid]));
    setUser(userObj);
  };

  const handleLogout = async () => {
    if (auth) {
      try {
        const { signOut } = await import("firebase/auth");
        await signOut(auth);
      } catch {}
    }
    _currentUser = null;
    localStorage.removeItem("ff_active_user_v2");
    setUser(null);
  };

  if (!user) return <LoginScreen onLogin={handleLogin} />;
  _currentUser = user.uid || user;
  return <FocusFlow currentUser={user} onLogout={handleLogout} />;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function FocusFlow({ currentUser, onLogout }) {
  const [page, setPage] = useState("today");
  const [tasks, setTasks] = useLocalStorage("ff_tasks", []);
  const [projects, setProjects] = useLocalStorage("ff_projects", []);
  const [reflections, setReflections] = useLocalStorage("ff_reflections", []);
  const [settings, setSettings] = useLocalStorage("ff_settings", {
    focusDuration: 25, shortBreak: 5, longBreak: 15, pomosUntilLong: 4,
    dailyCap: 8, weeklyCap: 40, tags: ["MA","Coding","Etsy","Teaching"],
  });
  const [timerState, setTimerState] = useLocalStorage("ff_timer", {
    mode: "focus", remaining: 25 * 60, running: false, sessionCount: 0, activeTaskId: null,
  });
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerState.running) {
      timerRef.current = setInterval(() => {
        setTimerState(s => {
          if (s.remaining <= 1) {
            clearInterval(timerRef.current);
            const nextCount = s.mode === "focus" ? s.sessionCount + 1 : s.sessionCount;
            const isLong = nextCount % settings.pomosUntilLong === 0;
            const nextMode = s.mode === "focus" ? (isLong ? "longBreak" : "shortBreak") : "focus";
            const nextTime = nextMode === "focus" ? settings.focusDuration * 60 : nextMode === "shortBreak" ? settings.shortBreak * 60 : settings.longBreak * 60;
            return { ...s, remaining: nextTime, running: false, mode: nextMode, sessionCount: nextCount };
          }
          return { ...s, remaining: s.remaining - 1 };
        });
      }, 1000);
    } else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [timerState.running, settings.pomosUntilLong, settings.focusDuration, settings.shortBreak, settings.longBreak]);

  const startTimer = () => setTimerState(s => ({ ...s, running: true }));
  const stopTimer  = () => setTimerState(s => ({ ...s, running: false }));
  const resetTimer = () => setTimerState(s => ({ ...s, running: false, remaining: settings.focusDuration * 60, mode: "focus" }));

  const addTask    = t  => setTasks(ts => [{ ...t, id: uid(), createdAt: today(), pomodoros: 0 }, ...ts]);
  const updateTask = (id, patch) => setTasks(ts => ts.map(x => x.id === id ? { ...x, ...patch } : x));
  const deleteTask = id => setTasks(ts => ts.filter(x => x.id !== id));
  const addProject = p  => setProjects(ps => [{ ...p, id: uid(), createdAt: today() }, ...ps]);
  const addReflection = r => setReflections(rs => [{ ...r, id: uid(), date: today() }, ...rs]);

  const todayTasks = tasks.filter(t => t.scheduledDate === today() || t.status === "In Progress");
  const activeTask = tasks.find(t => t.id === timerState.activeTaskId);

  const nav = [
    { id: "today", icon: "☀️", label: "Today" },
    { id: "week",  icon: "📅", label: "Week" },
    { id: "month", icon: "🗓️", label: "Month" },
    { id: "projects", icon: "📁", label: "Projects" },
    { id: "tasks", icon: "📋", label: "All Tasks" },
    { id: "reflections", icon: "✍️", label: "Reflections" },
    { id: "intelligence", icon: "🧠", label: "Study Intelligence" },
    { id: "recurring", icon: "🔁", label: "Recurring" },
    { id: "analytics", icon: "📈", label: "Analytics" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  const sharedProps = { tasks, projects, updateTask, deleteTask, addTask, settings, timerState, setTimerState, startTimer, stopTimer, resetTimer, activeTask, reflections, addReflection, addProject };

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: "0 20px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#7c5cfc,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🍅</div>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>FocusFlow</span>
        </div>

        {/* User badge */}
        <div style={{ margin: "0 12px 16px", padding: "10px 12px", borderRadius: 10, background: C.surfaceAlt, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          {currentUser.photo
            ? <img src={currentUser.photo} alt="avatar" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
            : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#7c5cfc,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0 }}>
                {(currentUser.displayName || currentUser.uid || "U")[0].toUpperCase()}
              </div>
          }
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.displayName || currentUser}</div>
            <div style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
              {currentUser.provider === "google" && <span style={{ fontSize: 9 }}>🔵</span>}
              {currentUser.provider === "email" && <span style={{ fontSize: 9 }}>✉️</span>}
              {currentUser.email ? currentUser.email.split("@")[0] : "local account"}
            </div>
          </div>
          <button onClick={onLogout} title="Sign out" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14, padding: 2, flexShrink: 0 }}>↪</button>
        </div>

        <nav style={{ flex: 1 }}>
          {nav.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              width: "100%", textAlign: "left", padding: "10px 20px", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 10,
              background: page === n.id ? C.accentSoft : "transparent",
              color: page === n.id ? C.accent : C.textMuted,
              borderLeft: page === n.id ? `3px solid ${C.accent}` : "3px solid transparent",
              fontSize: 14, fontWeight: page === n.id ? 600 : 400,
            }}>{n.icon} {n.label}</button>
          ))}
        </nav>
        <div style={{ margin: "0 12px", padding: 12, borderRadius: 10, background: C.accentSoft, border: `1px solid ${C.border}`, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: C.accent, marginBottom: 4 }}>💡 Pro Tip</div>
          Start with your most challenging task when your energy is highest!
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto" }}>
        {page === "today"       && <TodayView {...sharedProps} todayTasks={todayTasks} />}
        {page === "week"        && <WeekView {...sharedProps} addTask={addTask} />}
        {page === "month"       && <MonthView {...sharedProps} />}
        {page === "projects"    && <ProjectsView {...sharedProps} />}
        {page === "tasks"       && <AllTasksView {...sharedProps} />}
        {page === "reflections" && <ReflectionsView {...sharedProps} />}
        {page === "intelligence" && <StudyIntelligenceView {...sharedProps} />}
        {page === "recurring"   && <RecurringView />}
        {page === "analytics"   && <AnalyticsView {...sharedProps} />}
        {page === "settings"    && <SettingsView settings={settings} setSettings={setSettings} setPage={setPage} />}
      </main>
    </div>
  );
}

// ─── TODAY ────────────────────────────────────────────────────────────────────
function TodayView({ tasks, todayTasks, updateTask, deleteTask, addTask, timerState, setTimerState, startTimer, stopTimer, resetTimer, activeTask, settings, projects, addReflection }) {
  const [showAdd, setShowAdd] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [availableHours, setAvailableHours] = useLocalStorage("ff_today_hours", settings.dailyCap || 6);
  const doneTasks = todayTasks.filter(t => t.status === "Done").length;
  const pct = Math.min((doneTasks / settings.dailyCap) * 100, 100);
  const byStatus = STATUSES.map(s => ({ status: s, items: todayTasks.filter(t => t.status === s) }));
  const handleDrop = status => { if (dragging) { updateTask(dragging, { status }); setDragging(null); } };

  // ── StudyCal Time Allocation ──────────────────────────────────────────────
  const activeTasks = todayTasks.filter(t => t.status !== "Done");
  const scoredTasks = activeTasks
    .map(t => ({ ...t, _score: calcStudyCalScore(t) }))
    .sort((a, b) => b._score - a._score);
  const totalScore = scoredTasks.reduce((s, t) => s + t._score, 0);
  const allocations = scoredTasks.map(t => ({
    ...t,
    allocatedHours: totalScore > 0 ? +((t._score / totalScore) * availableHours).toFixed(1) : 0,
  }));

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: C.warning, fontSize: 14, marginBottom: 4 }}>
          🍵 {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: -1 }}>Today, {dayNames[new Date().getDay()]}</h1>
            <div style={{ color: C.textMuted, marginTop: 2 }}>{monthNames[new Date().getMonth()]} {new Date().getDate()}, {new Date().getFullYear()}</div>
          </div>
          <button onClick={() => setShowAdd(true)} style={btnStyle("primary")}>＋ Add Task</button>
        </div>
      </div>

      {/* StudyCal Available Hours + Allocation */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.surfaceAlt, borderRadius: 12, border: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 20 }}>🧠</span>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Available study hours today</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <button onClick={() => setAvailableHours(h => Math.max(0.5, +(h - 0.5).toFixed(1)))}
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", fontWeight: 700, fontSize: 16 }}>−</button>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.accent, minWidth: 40, textAlign: "center" }}>{availableHours}h</span>
          <button onClick={() => setAvailableHours(h => +(h + 0.5).toFixed(1))}
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", fontWeight: 700, fontSize: 16 }}>＋</button>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginLeft: 4 }}>Default set in Settings</div>
      </div>

      {/* Priority + time allocation panel */}
      {allocations.length > 0 && (
        <div style={{ marginBottom: 20, padding: "14px 16px", background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>📊 Today's Study Plan — ranked by priority</div>
          {allocations.map((t, i) => {
            const { color, label } = priorityLabel(t._score);
            const ctx = TASK_CONTEXTS.find(c => c.id === t.context);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.textMuted, width: 18, textAlign: "right", flexShrink: 0 }}>#{i+1}</span>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{ctx?.icon || "📋"}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ fontSize: 11, color, background: `${color}18`, padding: "2px 8px", borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>{t._score} · {label}</span>
                <div style={{ width: 140, flexShrink: 0 }}>
                  <div style={{ height: 6, background: C.border, borderRadius: 3, marginBottom: 2 }}>
                    <div style={{ width: `${Math.min((t.allocatedHours / availableHours) * 100, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color, fontWeight: 700 }}>Spend {t.allocatedHours}h</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Today's Capacity</div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, marginBottom: 12 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct > 90 ? C.danger : C.success, borderRadius: 3 }} />
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <Stat label="Done" value={doneTasks} color={C.success} />
            <Stat label="Planned" value={todayTasks.length} color={C.accent} />
            <Stat label="Cap." value={settings.dailyCap} color={C.textMuted} />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: pct > 100 ? C.danger : C.success, fontWeight: 600 }}>
            {pct > 100 ? "⚠️ Over capacity!" : "✓ Balanced load"}
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(124,92,252,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>⚡</div>
            <span style={{ color: C.textMuted, fontSize: 14 }}>Focus Sessions</span>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{timerState.sessionCount}</div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(74,222,128,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>✅</div>
            <span style={{ color: C.textMuted, fontSize: 14 }}>Tasks Done</span>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{doneTasks}</div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 20 }}>
        <AIAdvisor tasks={todayTasks} timerState={timerState} />
        <PomodoroPanel timerState={timerState} setTimerState={setTimerState} startTimer={startTimer} stopTimer={stopTimer} resetTimer={resetTimer} settings={settings} activeTask={activeTask} addReflection={addReflection} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {byStatus.map(({ status, items }) => (
          <KanbanColumn key={status} status={status} items={items}
            onDrop={() => handleDrop(status)} setDragging={setDragging}
            updateTask={updateTask} deleteTask={deleteTask}
            setTimerActiveTask={id => setTimerState(s => ({ ...s, activeTaskId: id }))}
            activeTaskId={timerState.activeTaskId} />
        ))}
      </div>

      {showAdd && <TaskModal projects={projects} onSave={t => { addTask({ ...t, scheduledDate: today() }); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─── WEEK ─────────────────────────────────────────────────────────────────────
function WeekView({ tasks, updateTask, addTask, projects }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState("hourly"); // "hourly" | "budget"
  const [dragInfo, setDragInfo] = useState(null);     // { taskId, origDate }
  const [hoverSlot, setHoverSlot] = useState(null);   // { dateStr, hour }
  const [newSlot, setNewSlot] = useState(null);        // { dateStr, hour } for quick-add
  const [quickTitle, setQuickTitle] = useState("");
  const HOUR_HEIGHT = 56; // px per hour
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const getDs = d => d.toISOString().slice(0, 10);

  // Tasks that have a scheduledHour set (placed on calendar)
  const placedTasks = tasks.filter(t => t.scheduledDate && t.scheduledHour != null);
  // Unplaced tasks (scheduled date but no hour, or no date)
  const unplaced = tasks.filter(t => t.scheduledDate && t.scheduledHour == null &&
    days.some(d => getDs(d) === t.scheduledDate));

  const getTasksAt = (dateStr, hour) =>
    placedTasks.filter(t => t.scheduledDate === dateStr && t.scheduledHour === hour);

  const handleDrop = (dateStr, hour) => {
    if (!dragInfo) return;
    updateTask(dragInfo.taskId, { scheduledDate: dateStr, scheduledHour: hour });
    setDragInfo(null); setHoverSlot(null);
  };

  const handleQuickAdd = (dateStr, hour) => {
    if (!quickTitle.trim()) { setNewSlot(null); return; }
    addTask({
      title: quickTitle, status: "Planned", scheduledDate: dateStr,
      scheduledHour: hour, context: "academic", difficulty: 3, stress: 3,
      plannedHours: 1, estimatedPomos: 2,
    });
    setQuickTitle(""); setNewSlot(null);
  };

  const fmtHour = h => {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  };

  const nowHour = new Date().getHours();
  const nowMin  = new Date().getMinutes();
  const todayDs = today();

  // ── HOURLY VIEW ─────────────────────────────────────────────────────────────
  const HourlyView = () => (
    <div style={{ display: "flex", overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
      {/* Time gutter */}
      <div style={{ width: 56, flexShrink: 0, borderRight: `1px solid ${C.border}`, position: "sticky", left: 0, background: C.bg, zIndex: 10 }}>
        <div style={{ height: 48 }} /> {/* header spacer */}
        {HOURS.map(h => (
          <div key={h} style={{ height: HOUR_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 4 }}>
            <span style={{ fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>{fmtHour(h)}</span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((d, di) => {
        const ds = getDs(d);
        const isToday = ds === todayDs;
        return (
          <div key={di} style={{ flex: 1, minWidth: 120, borderRight: `1px solid ${C.border}`, position: "relative" }}>
            {/* Day header */}
            <div style={{
              height: 48, position: "sticky", top: 0, zIndex: 5, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${C.border}`,
              background: isToday ? C.accentSoft : C.surface,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? C.accent : C.textMuted }}>{["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()]}</div>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday ? C.accent : "transparent",
                fontSize: 14, fontWeight: 800, color: isToday ? "#fff" : C.text, marginTop: 2,
              }}>{d.getDate()}</div>
            </div>

            {/* Hour slots */}
            {HOURS.map(h => {
              const slotTasks = getTasksAt(ds, h);
              const isHover = hoverSlot?.dateStr === ds && hoverSlot?.hour === h;
              const isNowSlot = isToday && h === nowHour;
              return (
                <div key={h}
                  style={{
                    height: HOUR_HEIGHT, borderBottom: `1px solid ${C.border}22`,
                    background: isHover ? `${C.accent}12` : isNowSlot ? `${C.tomato}08` : "transparent",
                    position: "relative", cursor: "pointer", transition: "background 0.1s",
                  }}
                  onDragOver={e => { e.preventDefault(); setHoverSlot({ dateStr: ds, hour: h }); }}
                  onDragLeave={() => setHoverSlot(null)}
                  onDrop={() => handleDrop(ds, h)}
                  onDoubleClick={() => { setNewSlot({ dateStr: ds, hour: h }); setQuickTitle(""); }}
                >
                  {/* Hour grid line — darker on the hour */}
                  {h % 6 === 0 && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: C.border }} />
                  )}

                  {/* "Now" indicator */}
                  {isNowSlot && (
                    <div style={{
                      position: "absolute", top: `${(nowMin / 60) * HOUR_HEIGHT}px`,
                      left: 0, right: 0, height: 2, background: C.tomato, zIndex: 4,
                      boxShadow: `0 0 6px ${C.tomato}`,
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.tomato, marginTop: -3, marginLeft: -4 }} />
                    </div>
                  )}

                  {/* Task blocks */}
                  {slotTasks.map((t, ti) => {
                    const { color } = priorityLabel(calcStudyCalScore(t));
                    const ctx = TASK_CONTEXTS.find(c => c.id === t.context);
                    const blockH = Math.max(HOUR_HEIGHT * (t.plannedHours || 1) - 4, HOUR_HEIGHT - 4);
                    return (
                      <div key={t.id}
                        draggable
                        onDragStart={() => setDragInfo({ taskId: t.id, origDate: ds })}
                        onDragEnd={() => { setDragInfo(null); setHoverSlot(null); }}
                        style={{
                          position: "absolute", top: 2, left: `${ti * 6}px`, right: 2,
                          height: blockH, borderRadius: 6, padding: "4px 6px",
                          background: `${color}22`, border: `1px solid ${color}66`,
                          borderLeft: `3px solid ${color}`, cursor: "grab", zIndex: 2,
                          overflow: "hidden",
                        }}
                        title={`${t.title} — Score: ${calcStudyCalScore(t)}`}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ctx?.icon} {t.title}
                        </div>
                        {blockH > 30 && (
                          <div style={{ fontSize: 9, color: C.textMuted }}>
                            {calcStudyCalScore(t)} · {t.plannedHours || 1}h
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Quick add input */}
                  {newSlot?.dateStr === ds && newSlot?.hour === h && (
                    <div style={{ position: "absolute", top: 2, left: 2, right: 2, zIndex: 10 }}
                      onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={quickTitle}
                        onChange={e => setQuickTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleQuickAdd(ds, h);
                          if (e.key === "Escape") setNewSlot(null);
                        }}
                        onBlur={() => handleQuickAdd(ds, h)}
                        placeholder="Task name..."
                        style={{ width: "100%", padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.accent}`, background: C.surface, color: C.text, fontSize: 11 }}
                      />
                    </div>
                  )}

                  {/* Hover hint */}
                  {isHover && slotTasks.length === 0 && !newSlot && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, color: C.textDim }}>Drop here · dbl-click to add</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // ── BUDGET VIEW ──────────────────────────────────────────────────────────────
  const BudgetView = () => {
    const totalScore = tasks.filter(t => t.status !== "Done")
      .reduce((s, t) => s + calcStudyCalScore(t), 0);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10 }}>
        {days.map((d, di) => {
          const ds = getDs(d);
          const isToday = ds === todayDs;
          const dayTasks = tasks.filter(t => t.scheduledDate === ds && t.status !== "Done")
            .map(t => ({ ...t, _score: calcStudyCalScore(t) }))
            .sort((a, b) => b._score - a._score);
          const dayTotal = dayTasks.reduce((s, t) => s + t._score, 0);
          const dayHours = dayTasks.reduce((s, t) => s + (t.plannedHours || 1), 0);

          return (
            <div key={di} style={{
              background: isToday ? C.accentSoft : C.surfaceAlt,
              border: `1px solid ${isToday ? C.accent : C.border}`,
              borderRadius: 12, padding: 12,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: isToday ? C.accent : C.text, marginBottom: 2 }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: isToday ? C.accent : C.text }}>{d.getDate()}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>{dayHours}h planned · {dayTasks.length} tasks</div>

              {dayTasks.map(t => {
                const { color } = priorityLabel(t._score);
                const pct = dayTotal > 0 ? (t._score / dayTotal) * 100 : 0;
                const ctx = TASK_CONTEXTS.find(c => c.id === t.context);
                return (
                  <div key={t.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 10 }}>{ctx?.icon || "📋"}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                      <span style={{ fontSize: 10, color, fontWeight: 700 }}>{t._score}</span>
                    </div>
                    <div style={{ height: 5, background: C.border, borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{t.plannedHours || 1}h planned</div>
                  </div>
                );
              })}

              {dayTasks.length === 0 && (
                <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", padding: "16px 0" }}>Free day ✨</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── UNPLACED PANEL ──────────────────────────────────────────────────────────
  const UnplacedPanel = () => {
    if (unplaced.length === 0) return null;
    return (
      <div style={{ padding: "12px 16px", background: C.surfaceAlt, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.textMuted }}>
          📌 This week — not yet placed on calendar ({unplaced.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {unplaced.map(t => {
            const { color } = priorityLabel(calcStudyCalScore(t));
            return (
              <div key={t.id}
                draggable
                onDragStart={() => setDragInfo({ taskId: t.id, origDate: t.scheduledDate })}
                style={{
                  padding: "5px 10px", borderRadius: 8, border: `1px solid ${color}55`,
                  background: `${color}12`, fontSize: 12, fontWeight: 600, cursor: "grab",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                <span style={{ color }}>{calcStudyCalScore(t)}</span>
                <span>{t.title}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Drag onto the calendar to place them</div>
      </div>
    );
  };

  return (
    <div style={{ padding: "24px 24px 0", display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Week View</h1>
          <div style={{ color: C.textMuted, fontSize: 13, marginTop: 1 }}>
            {formatDate(days[0])} – {formatDate(days[6])}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: C.surfaceAlt, borderRadius: 8, padding: 3, gap: 2 }}>
            {[["hourly","🕐 Hourly"],["budget","📊 Budget"]].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: viewMode === v ? C.accent : "transparent",
                color: viewMode === v ? "#fff" : C.textMuted,
              }}>{l}</button>
            ))}
          </div>
          <button onClick={() => setWeekOffset(w => w-1)} style={btnStyle("secondary")}>‹</button>
          <button onClick={() => setWeekOffset(0)} style={{ ...btnStyle("secondary"), fontWeight: 700 }}>Today</button>
          <button onClick={() => setWeekOffset(w => w+1)} style={btnStyle("secondary")}>›</button>
        </div>
      </div>

      {/* Hint */}
      {viewMode === "hourly" && (
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, flexShrink: 0 }}>
          💡 Drag tasks onto time slots · Double-click any slot to quickly add a task
        </div>
      )}

      <UnplacedPanel />

      {/* Main view */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {viewMode === "hourly" ? <HourlyView /> : <BudgetView />}
      </div>
    </div>
  );
}

// ─── MONTH ────────────────────────────────────────────────────────────────────
function MonthView({ tasks, projects }) {
  const [date, setDate] = useState(new Date());
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, () => null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  return (
    <div style={{ padding: 32, display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Month View</h1>
            <div style={{ color: C.textMuted, marginTop: 2 }}>{monthNames[month]} {year}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDate(d => new Date(d.getFullYear(), d.getMonth()-1))} style={btnStyle("secondary")}>‹</button>
            <button onClick={() => setDate(new Date())} style={btnStyle("secondary")}>Today</button>
            <button onClick={() => setDate(d => new Date(d.getFullYear(), d.getMonth()+1))} style={btnStyle("secondary")}>›</button>
          </div>
        </div>
        <div style={{ background: C.surfaceAlt, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: C.surface }}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: 600, color: C.textMuted }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ height: 90, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }} />;
              const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dt = tasks.filter(t => t.scheduledDate === ds || t.dueDate === ds);
              const isToday = ds === today();
              return (
                <div key={i} style={{ height: 90, padding: "6px 8px", overflow: "hidden", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, background: isToday ? C.accentSoft : "transparent" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: isToday ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? "#fff" : C.textMuted, marginBottom: 3 }}>{day}</div>
                  {dt.slice(0,2).map(t => (
                    <div key={t.id} style={{ background: C.accent, borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#fff", marginBottom: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{t.title}</div>
                  ))}
                  {dt.length > 2 && <div style={{ fontSize: 10, color: C.textMuted }}>+{dt.length-2}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div>
        <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Active Projects</h3>
        {projects.length === 0 && <div style={{ color: C.textMuted, fontSize: 14 }}>No projects yet.</div>}
        {projects.map(p => {
          const pt = tasks.filter(t => t.projectId === p.id);
          const done = pt.filter(t => t.status === "Done").length;
          const pct = pt.length ? Math.round((done/pt.length)*100) : 0;
          return (
            <Card key={p.id} style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color || C.accent }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
              </div>
              <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 5 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: p.color || C.accent, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{done}/{pt.length} tasks</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
function ProjectsView({ projects, tasks, addProject, updateTask }) {
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [np, setNp] = useState({ name: "", color: PROJECT_COLORS[0], deadline: "" });

  const selProj = projects.find(p => p.id === selected);
  const projTasks = tasks.filter(t => t.projectId === selected);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Projects</h1>
          <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>Manage your projects and break down work</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={btnStyle("primary")}>＋ New Project</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        <div>
          {projects.map(p => {
            const pt = tasks.filter(t => t.projectId === p.id);
            const done = pt.filter(t => t.status === "Done").length;
            return (
              <div key={p.id} onClick={() => setSelected(p.id)} style={{
                padding: "12px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
                background: selected === p.id ? C.accentSoft : C.surfaceAlt,
                border: `1px solid ${selected === p.id ? C.accent : C.border}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color || C.accent, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{done}/{pt.length} tasks</div>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <div style={{ textAlign: "center", color: C.textMuted, padding: 24, fontSize: 14 }}>No projects yet.</div>}
        </div>
        <Card>
          {selProj ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: selProj.color || C.accent }} />
                <h2 style={{ margin: 0 }}>{selProj.name}</h2>
                {selProj.deadline && <span style={{ fontSize: 13, color: C.textMuted }}>📅 {formatDate(selProj.deadline)}</span>}
              </div>
              {projTasks.length === 0
                ? <div style={{ color: C.textMuted }}>No tasks in this project yet.</div>
                : projTasks.map(t => (
                  <div key={t.id} style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 6, background: C.surfaceAlt, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="checkbox" checked={t.status === "Done"}
                      onChange={e => updateTask(t.id, { status: e.target.checked ? "Done" : "In Progress" })}
                      style={{ accentColor: C.accent }} />
                    <span style={{ fontSize: 14, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? C.textMuted : C.text, flex: 1 }}>{t.title}</span>
                    <span style={{ fontSize: 12, color: C.textMuted }}>{t.status}</span>
                  </div>
                ))
              }
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: C.textMuted }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Select a project</div>
              <div style={{ fontSize: 14 }}>Choose a project from the left to view its tasks</div>
            </div>
          )}
        </Card>
      </div>
      {showAdd && (
        <Modal title="New Project" onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Project Name" value={np.name} onChange={v => setNp(p => ({ ...p, name: v }))} />
            <div>
              <label style={labelStyle()}>Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PROJECT_COLORS.map(color => (
                  <div key={color} onClick={() => setNp(p => ({ ...p, color }))}
                    style={{ width: 24, height: 24, borderRadius: "50%", background: color, cursor: "pointer", outline: np.color === color ? "3px solid #fff" : "none", outlineOffset: 2 }} />
                ))}
              </div>
            </div>
            <Input label="Deadline (optional)" type="date" value={np.deadline} onChange={v => setNp(p => ({ ...p, deadline: v }))} />
            <button onClick={() => { if (np.name) { addProject(np); setShowAdd(false); setNp({ name: "", color: PROJECT_COLORS[0], deadline: "" }); } }} style={btnStyle("primary")}>
              Create Project
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { tasks: [], errors: ["File is empty or has no data rows."] };

  const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const errors = [];
  const tasks = [];

  const splitRow = (line) => {
    const cols = []; let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };

  const parseDate = (d) => {
    if (!d) return "";
    const parts = d.split("/");
    if (parts.length === 3) {
      const [m, day, y] = parts;
      return `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
    return d;
  };

  lines.slice(1).forEach((line, i) => {
    const cols = splitRow(line);
    const row = {};
    header.forEach((h, idx) => { row[h] = (cols[idx] || "").trim(); });
    if (!row.title) { errors.push(`Row ${i + 2}: missing title — skipped`); return; }

    const statusMap = { planned: "Planned", backlog: "Backlog", "in progress": "In Progress", done: "Done" };
    const status = statusMap[(row.status || "backlog").toLowerCase()] || "Backlog";
    const validPriorities = ["low","medium","high","critical"];
    const priority = validPriorities.includes((row.priority||"medium").toLowerCase()) ? row.priority.toLowerCase() : "medium";
    const validTypes = ["homework","project","test","quiz","reading","other"];
    const taskType = validTypes.includes((row.task_type||"").toLowerCase()) ? row.task_type.toLowerCase() : "other";

    tasks.push({
      title: row.title,
      description: row.description || "",
      className: row.class_name || "",
      taskType,
      dueDate: parseDate(row.due_date),
      scheduledDate: parseDate(row.scheduled_date),
      priority,
      status,
      estimatedPomos: parseInt(row.estimated_pomos) || 1,
      tags: row.tags ? row.tags.split(";").map(t => t.trim()).filter(Boolean) : [],
      pomodoros: 0,
    });
  });

  return { tasks, errors };
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────
function CSVImportModal({ onClose, onImport, existingTasks }) {
  const [step, setStep] = useState("upload");
  const [parsed, setParsed] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const fileRef = useRef(null);
  const existingTitles = new Set(existingTasks.map(t => t.title.toLowerCase()));

  const handleFile = (file) => {
    if (!file || !file.name.endsWith(".csv")) { setParseErrors(["Please upload a .csv file."]); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const { tasks, errors } = parseCSV(e.target.result);
      setParsed(tasks);
      setParseErrors(errors);
      setSelected(new Set(tasks.map((_,i)=>i).filter(i => !existingTitles.has(tasks[i].title.toLowerCase()))));
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const toggle = (i) => setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const doImport = () => {
    const toImport = parsed.filter((_,i) => selected.has(i));
    setImportCount(toImport.length);
    onImport(toImport);
    setStep("done");
  };

  const pColors = { low: "#4ade80", medium: "#fbbf24", high: "#f97316", critical: "#ef4444" };

  return (
    <Modal title="Import CSV" onClose={onClose}>
      {step === "upload" && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? C.accent : C.border}`, borderRadius: 12,
              padding: "44px 24px", textAlign: "center", cursor: "pointer",
              background: dragOver ? C.accentSoft : C.bg, transition: "all 0.15s", marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 10 }}>📂</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Drop your CSV file here</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>or click to browse</div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>
          {parseErrors.length > 0 && parseErrors.map((e,i) => (
            <div key={i} style={{ color: C.danger, fontSize: 13, marginBottom: 4 }}>⚠ {e}</div>
          ))}
          <div style={{ background: C.surfaceAlt, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>📋 Expected columns</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {["title","description","class_name","task_type","due_date","scheduled_date","priority","status","estimated_pomos","tags"].map(col => (
                <span key={col} style={{ fontSize: 11, padding: "2px 8px", background: C.accentSoft, color: C.accent, borderRadius: 5, fontFamily: "monospace" }}>{col}</span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
              <b style={{color:C.text}}>Dates:</b> M/D/YYYY &nbsp;·&nbsp;
              <b style={{color:C.text}}>Status:</b> backlog / planned / in progress / done &nbsp;·&nbsp;
              <b style={{color:C.text}}>Tags:</b> semicolon-separated (e.g. Math;Quiz)
            </div>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: C.success, fontWeight: 700 }}>{selected.size} selected</span>
              <span style={{ color: C.textMuted }}> / {parsed.length} rows</span>
              {parseErrors.length > 0 && <span style={{ color: C.warning, marginLeft: 8 }}>· {parseErrors.length} skipped</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setSelected(new Set(parsed.map((_,i)=>i)))} style={{ ...btnStyle("secondary"), fontSize: 12, padding: "4px 10px" }}>All</button>
              <button onClick={() => setSelected(new Set())} style={{ ...btnStyle("secondary"), fontSize: 12, padding: "4px 10px" }}>None</button>
            </div>
          </div>
          {parseErrors.length > 0 && (
            <div style={{ background: C.tomatoSoft, border: `1px solid ${C.tomato}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
              {parseErrors.map((e,i) => <div key={i} style={{ color: C.danger, fontSize: 12 }}>⚠ {e}</div>)}
            </div>
          )}
          <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
            {parsed.map((t, i) => {
              const isDupe = existingTitles.has(t.title.toLowerCase());
              const isSel = selected.has(i);
              return (
                <div key={i} onClick={() => toggle(i)} style={{
                  padding: "10px 12px", borderRadius: 8, marginBottom: 6, cursor: "pointer",
                  border: `1px solid ${isSel ? C.accent : C.border}`,
                  background: isSel ? C.accentSoft : C.bg,
                  display: "flex", alignItems: "flex-start", gap: 10, transition: "all 0.12s",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2,
                    border: `2px solid ${isSel ? C.accent : C.border}`,
                    background: isSel ? C.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isSel && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                      {isDupe && <span style={{ fontSize: 10, padding: "1px 6px", background: "rgba(251,191,36,0.15)", color: C.warning, borderRadius: 4, border: `1px solid ${C.warning}` }}>duplicate</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {t.className && <span style={{ fontSize: 11, color: C.textMuted }}>📚 {t.className}</span>}
                      <span style={{ fontSize: 11, color: pColors[t.priority] }}>● {t.priority}</span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{t.status}</span>
                      {t.dueDate && <span style={{ fontSize: 11, color: C.textMuted }}>📅 {formatDate(t.dueDate)}</span>}
                      <span style={{ fontSize: 11, color: C.tomato }}>🍅 {t.estimatedPomos}</span>
                      {t.tags && t.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 11, padding: "1px 6px", background: C.accentSoft, color: C.accent, borderRadius: 4 }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("upload")} style={{ ...btnStyle("secondary"), flex: 1 }}>← Back</button>
            <button onClick={doImport} disabled={selected.size === 0}
              style={{ ...btnStyle("primary"), flex: 2, opacity: selected.size === 0 ? 0.5 : 1 }}>
              Import {selected.size} task{selected.size !== 1 ? "s" : ""} →
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 54, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Import complete!</div>
          <div style={{ color: C.textMuted, marginBottom: 24 }}>{importCount} task{importCount !== 1 ? "s" : ""} added successfully.</div>
          <button onClick={onClose} style={{ ...btnStyle("primary"), padding: "10px 32px" }}>Done</button>
        </div>
      )}
    </Modal>
  );
}

// ─── ALL TASKS ────────────────────────────────────────────────────────────────
function AllTasksView({ tasks, projects, addTask, updateTask, deleteTask }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) &&
    (filterStatus === "All" || t.status === filterStatus) &&
    (filterPriority === "All" || t.priority === filterPriority)
  );
  const pColors = { low: "#4ade80", medium: "#fbbf24", high: "#f97316", critical: "#ef4444" };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>All Tasks</h1>
          <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>{filtered.length} of {tasks.length} tasks</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImport(true)} style={btnStyle("secondary")}>⬆ Import CSV</button>
          <button onClick={() => setShowAdd(true)} style={btnStyle("primary")}>＋ New Task</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
          style={{ ...inputStyle(), flex: 1, minWidth: 200 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle()}>
          <option>All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={inputStyle()}>
          <option>All</option>{PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {filtered.map(t => (
        <div key={t.id} style={{ padding: "12px 16px", background: C.surfaceAlt, borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div onClick={() => updateTask(t.id, { status: t.status === "Done" ? "In Progress" : "Done" })}
            style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${t.status === "Done" ? C.success : C.border}`, background: t.status === "Done" ? C.success : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {t.status === "Done" && <span style={{ color: "#000", fontSize: 11 }}>✓</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {t.context && <span style={{ fontSize: 13 }}>{TASK_CONTEXTS.find(c=>c.id===t.context)?.icon || "📋"}</span>}
              <span style={{ fontWeight: 600, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? C.textMuted : C.text }}>{t.title}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              {t.priority && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${pColors[t.priority]}22`, color: pColors[t.priority] }}>{t.priority}</span>}
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: C.border, color: C.textMuted }}>{t.status}</span>
              {t.dueDate && <span style={{ fontSize: 11, color: C.textMuted }}>📅 {formatDate(t.dueDate)}</span>}
              {t.estimatedPomos && <span style={{ fontSize: 11, color: C.tomato }}>🍅 {t.pomodoros||0}/{t.estimatedPomos}</span>}
              {t.impactScore && <span style={{ fontSize: 11, color: C.accent }}>↗ {t.impactScore}</span>}
              {t.className && <span style={{ fontSize: 11, color: C.textMuted }}>📚 {t.className}</span>}
              {t.tags && t.tags.map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: C.accentSoft, color: C.accent }}>{tag}</span>
              ))}
              <ScoreBadge task={t} />
            </div>
          </div>
          <button onClick={() => deleteTask(t.id)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", color: C.textMuted, padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No tasks yet</div>
          <div style={{ fontSize: 14, marginBottom: 20 }}>Add tasks manually or import from a CSV file</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => setShowImport(true)} style={btnStyle("secondary")}>⬆ Import CSV</button>
            <button onClick={() => setShowAdd(true)} style={btnStyle("primary")}>＋ New Task</button>
          </div>
        </div>
      )}

      {showAdd && (
        <TaskModal projects={projects}
          onSave={t => { addTask(t); setShowAdd(false); }}
          onClose={() => setShowAdd(false)} />
      )}
      {showImport && (
        <CSVImportModal existingTasks={tasks}
          onImport={newTasks => { newTasks.forEach(t => addTask(t)); setShowImport(false); }}
          onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

// ─── REFLECTIONS ─────────────────────────────────────────────────────────────
function ReflectionsView({ reflections }) {
  const metrics = [
    { key: "focus",      label: "Focus",      icon: "🎯", color: C.accent  },
    { key: "energy",     label: "Energy",     icon: "⚡", color: C.warning },
    { key: "stress",     label: "Stress",     icon: "❤️", color: C.danger  },
    { key: "confidence", label: "Confidence", icon: "⭐", color: C.success },
  ];

  const avg = key => reflections.length
    ? (reflections.reduce((s,r) => s + (r[key]||0), 0) / reflections.length).toFixed(1)
    : "—";

  // Radar data
  const radarData = metrics.map(m => ({
    metric: m.label,
    value: reflections.length ? +(reflections.reduce((s,r)=>s+(r[m.key]||0),0)/reflections.length).toFixed(2) : 0,
  }));

  // Trend data — last 14 days grouped by date
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const trendData = last14.map(date => {
    const dayRefs = reflections.filter(r => r.date === date);
    const entry = { date: date.slice(5).replace("-", "/") }; // "MM/DD"
    metrics.forEach(m => {
      entry[m.key] = dayRefs.length
        ? +(dayRefs.reduce((s,r)=>s+(r[m.key]||0),0)/dayRefs.length).toFixed(2)
        : null;
    });
    return entry;
  }).filter(d => metrics.some(m => d[m.key] !== null));

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Reflections</h1>
        <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>Review your focus, energy, and progress over time.</div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {metrics.map(m => (
          <Card key={m.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${m.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{m.icon}</div>
            <div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{m.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{avg(m.key)}<span style={{ fontSize: 13, color: C.textMuted }}>/5</span></div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Radar */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>Overall Averages</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{reflections.length} reflections total</div>
          </div>
          {reflections.length === 0 ? (
            <div style={{ textAlign: "center", color: C.textMuted, padding: 40 }}>No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={C.border} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: C.textMuted, fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Line trend */}
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Trend (Last 14 Days)</div>
          {trendData.length < 2 ? (
            <div style={{ textAlign: "center", color: C.textMuted, padding: 40 }}>Not enough data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                <XAxis dataKey="date" tick={{ fill: C.textMuted, fontSize: 11 }} />
                <YAxis domain={[0, 5]} tick={{ fill: C.textMuted, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.textMuted }} />
                {metrics.map(m => (
                  <Line key={m.key} type="monotone" dataKey={m.key} name={m.label}
                    stroke={m.color} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Recent reflections list */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🕐</span>
        <h3 style={{ fontWeight: 700, margin: 0 }}>Recent Reflections</h3>
      </div>

      {reflections.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", color: C.textMuted, padding: 30 }}>
            No reflections yet. Complete a Pomodoro session to add one!
          </div>
        </Card>
      ) : reflections.map(r => (
        <Card key={r.id} style={{ marginBottom: 8, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {/* Avatar */}
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎯</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.taskName || "General"}</span>
                  <span style={{ fontSize: 12, background: C.tomatoSoft, color: C.tomato, padding: "1px 7px", borderRadius: 10 }}>🍅 #{r.session || "?"}</span>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {metrics.map(m => (
                    <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{m.label}</span>
                      <span style={{ fontSize: 13, letterSpacing: 1 }}>
                        {Array.from({length:5}).map((_,i) => (
                          <span key={i} style={{ color: i < (r[m.key]||0) ? m.color : C.border }}>●</span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                {r.notes && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 5 }}>{r.notes}</div>}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, flexShrink: 0, marginLeft: 12 }}>{r.date}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}


// ─── STUDY INTELLIGENCE ───────────────────────────────────────────────────────
function StudyIntelligenceView({ tasks, reflections, updateTask }) {
  const [topics, setTopics] = useLocalStorage("ff_topics", []);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [newTopic, setNewTopic] = useState({ name: "", category: "", difficulty: 3, confidence: 3 });
  const [activeTab, setActiveTab] = useState("recommendations");

  // ── Priority score formula ──────────────────────────────────────────────────
  // Higher score = study this first
  // Logic: topics where gap between difficulty and confidence is highest,
  //        weighted by how long since last studied
  const scoreTopic = (topic) => {
    // Uses StudyCal formula for topics (no due date = urgency 3, no assignment weight)
    const task = {
      dueDate: topic.dueDate || null,
      context: topic.context || "examprep",
      assignmentWeight: topic.assignmentWeight || null,
      impactRating: topic.impactRating || 3,
      difficulty: topic.difficulty || 3,
      stress: topic.avgStress || 3,
      plannedHours: topic.plannedHours || 4,
      completedHours: topic.completedHours || 0,
    };
    // Blend confidence into difficulty (low confidence = effectively harder)
    const effectiveDifficulty = Math.min(5, +((topic.difficulty + (5 - topic.effectiveConfidence || 5 - topic.confidence)) / 2).toFixed(1));
    return calcStudyCalScore({ ...task, difficulty: effectiveDifficulty });
  };

  // ── Merge task reflections into topic confidence ────────────────────────────
  // For each topic, find reflections on tasks with matching className or title
  const enrichedTopics = topics.map(topic => {
    const relatedRefs = reflections.filter(r =>
      r.taskName && (
        r.taskName.toLowerCase().includes(topic.name.toLowerCase()) ||
        r.taskName.toLowerCase().includes(topic.category.toLowerCase())
      )
    );
    // Average confidence from reflections if available
    const avgConfFromRefs = relatedRefs.length
      ? +(relatedRefs.reduce((s, r) => s + (r.confidence || topic.confidence), 0) / relatedRefs.length).toFixed(1)
      : null;
    // Average stress (high stress on a topic = harder than rated)
    const avgStress = relatedRefs.length
      ? +(relatedRefs.reduce((s, r) => s + (r.stress || 3), 0) / relatedRefs.length).toFixed(1)
      : null;
    const effectiveConfidence = avgConfFromRefs
      ? +((topic.confidence + avgConfFromRefs) / 2).toFixed(1)
      : topic.confidence;
    const score = scoreTopic({ ...topic, confidence: effectiveConfidence });
    return { ...topic, effectiveConfidence, avgStress, relatedRefs: relatedRefs.length, score };
  });

  const sorted = [...enrichedTopics].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const strong = sorted.filter(t => t.score < 2);

  const addTopic = () => {
    if (!newTopic.name.trim()) return;
    setTopics(ts => [...ts, { ...newTopic, id: uid(), lastStudied: null, studySessions: 0, createdAt: today() }]);
    setNewTopic({ name: "", category: "", difficulty: 3, confidence: 3 });
    setShowAddTopic(false);
  };

  const updateTopic = (id, changes) => {
    setTopics(ts => ts.map(t => t.id === id ? { ...t, ...changes } : t));
  };

  const markStudied = (id) => {
    setTopics(ts => ts.map(t => t.id === id
      ? { ...t, lastStudied: new Date().toISOString(), studySessions: (t.studySessions || 0) + 1 }
      : t));
  };

  const getAIInsight = async () => {
    setAiLoading(true);
    setAiInsight(null);
    try {
      const topicSummary = sorted.slice(0, 8).map(t =>
        `${t.name} (difficulty: ${t.difficulty}/5, confidence: ${t.effectiveConfidence}/5, last studied: ${t.lastStudied ? Math.floor((Date.now()-new Date(t.lastStudied))/86400000)+" days ago" : "never"}, sessions: ${t.studySessions||0})`
      ).join("; ");
      const recentRefs = reflections.slice(0, 5).map(r =>
        `${r.taskName}: focus=${r.focus}/5, energy=${r.energy}/5, stress=${r.stress}/5, confidence=${r.confidence}/5`
      ).join("; ");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a personalized study coach inside a Pomodoro productivity app called FocusFlow. 
You have access to a student's topic confidence/difficulty ratings and their recent session reflections.
Give a warm, specific, actionable 3-4 sentence insight. 
Focus on: what to study first and why, any patterns you notice, and one specific encouragement.
Be personal and specific — reference actual topic names. Do not use bullet points. Write in a conversational tone.`,
          messages: [{
            role: "user",
            content: `My topics ranked by priority: ${topicSummary || "No topics added yet"}.
Recent session reflections: ${recentRefs || "No reflections yet"}.
Give me a personalized study recommendation for today.`
          }]
        })
      });
      const data = await resp.json();
      setAiInsight(data.content?.[0]?.text || "Unable to generate insight right now.");
    } catch {
      setAiInsight("Could not connect to AI. Check your internet connection and try again.");
    }
    setAiLoading(false);
  };

  const confColor = (v) => v >= 4 ? C.success : v >= 3 ? C.warning : C.danger;
  const diffColor = (v) => v >= 4 ? C.danger : v >= 3 ? C.warning : C.success;
  const priorityColor = (score) => score >= 6 ? C.danger : score >= 3 ? C.warning : C.success;
  const priorityLabel = (score) => score >= 6 ? "Study First" : score >= 3 ? "Review Soon" : "You Got This";

  const tabs = [
    { id: "recommendations", label: "📊 Recommendations" },
    { id: "topics", label: "📚 My Topics" },
    { id: "insight", label: "🧠 AI Coach" },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Study Intelligence</h1>
        <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>
          Personalized recommendations based on your confidence, difficulty, and history.
        </div>
      </div>

      {/* Empty state */}
      {topics.length === 0 && (
        <Card style={{ textAlign: "center", padding: 48, marginBottom: 20 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🧠</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Add your study topics to get started</div>
          <div style={{ color: C.textMuted, fontSize: 14, marginBottom: 24, maxWidth: 420, margin: "0 auto 24px" }}>
            Add each subject or topic you're studying — like "Biochemistry", "Organic Chemistry", "Psychology".
            Rate how difficult it is and how confident you feel. FocusFlow will tell you what to study first.
          </div>
          <button onClick={() => setShowAddTopic(true)} style={{ ...btnStyle("primary"), padding: "12px 32px", fontSize: 15 }}>
            ＋ Add Your First Topic
          </button>
        </Card>
      )}

      {topics.length > 0 && (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.surfaceAlt, borderRadius: 10, padding: 4 }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: activeTab === tab.id ? C.surface : "transparent",
                color: activeTab === tab.id ? C.accent : C.textMuted,
                boxShadow: activeTab === tab.id ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}>{tab.label}</button>
            ))}
          </div>

          {/* ── TAB: Recommendations ── */}
          {activeTab === "recommendations" && (
            <div>
              {/* Priority queue — top 3 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>🎯 Study These First Today</div>
                {top3.length === 0
                  ? <Card><div style={{ color: C.textMuted, textAlign: "center", padding: 20 }}>Add more topics to see recommendations.</div></Card>
                  : top3.map((t, i) => (
                    <Card key={t.id} style={{ marginBottom: 10, border: i === 0 ? `2px solid ${C.accent}` : `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {/* Rank badge */}
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: i === 0 ? C.accent : i === 1 ? C.surfaceAlt : C.bg,
                          border: `2px solid ${i === 0 ? C.accent : C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: 16, color: i === 0 ? "#fff" : C.textMuted,
                        }}>{i + 1}</div>

                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</span>
                            {t.category && <span style={{ fontSize: 12, color: C.textMuted, background: C.surfaceAlt, padding: "2px 8px", borderRadius: 6 }}>{t.category}</span>}
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
                              background: `${priorityColor(t.score)}22`, color: priorityColor(t.score) }}>
                              {priorityLabel(t.score)}
                            </span>
                          </div>

                          {/* Confidence vs Difficulty bars */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>
                                Confidence {t.relatedRefs > 0 ? "(from your reflections)" : "(self-rated)"}
                              </div>
                              <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
                                <div style={{ width: `${(t.effectiveConfidence/5)*100}%`, height: "100%", background: confColor(t.effectiveConfidence), borderRadius: 3, transition: "width 0.5s" }} />
                              </div>
                              <div style={{ fontSize: 11, color: confColor(t.effectiveConfidence), marginTop: 2, fontWeight: 600 }}>{t.effectiveConfidence}/5</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Difficulty</div>
                              <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
                                <div style={{ width: `${(t.difficulty/5)*100}%`, height: "100%", background: diffColor(t.difficulty), borderRadius: 3 }} />
                              </div>
                              <div style={{ fontSize: 11, color: diffColor(t.difficulty), marginTop: 2, fontWeight: 600 }}>{t.difficulty}/5</div>
                            </div>
                          </div>

                          {/* Why this topic */}
                          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                            {t.difficulty > t.effectiveConfidence
                              ? `⚠️ Difficulty (${t.difficulty}) is higher than your confidence (${t.effectiveConfidence.toFixed(1)}) — this needs attention.`
                              : `✓ You're on top of this one — confidence matches difficulty.`}
                            {t.lastStudied === null && " You haven't studied this yet."}
                            {t.lastStudied && ` Last studied ${Math.floor((Date.now()-new Date(t.lastStudied))/86400000)} days ago.`}
                            {t.relatedRefs > 0 && ` Confidence adjusted from ${t.relatedRefs} reflection${t.relatedRefs>1?"s":""}.`}
                          </div>
                        </div>

                        {/* Mark studied button */}
                        <button onClick={() => markStudied(t.id)} style={{ ...btnStyle("primary"), fontSize: 12, padding: "6px 12px", flexShrink: 0 }}>
                          ✓ Studied
                        </button>
                      </div>
                    </Card>
                  ))
                }
              </div>

              {/* Strong topics */}
              {strong.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>💪 You're Strong Here — Lower Priority</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {strong.map(t => (
                      <div key={t.id} style={{ padding: "8px 14px", background: "rgba(74,222,128,0.1)", border: `1px solid ${C.success}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                        <span style={{ fontSize: 11, color: C.success }}>Conf: {t.effectiveConfidence}/5</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full sorted list */}
              {sorted.length > 3 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>📋 Full Priority Order</div>
                  {sorted.map((t, i) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: C.surfaceAlt, borderRadius: 8, marginBottom: 6, border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, color: C.textMuted, width: 20, textAlign: "center" }}>#{i+1}</span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{t.category}</span>
                      <span style={{ fontSize: 11, color: confColor(t.effectiveConfidence) }}>Conf {t.effectiveConfidence}/5</span>
                      <span style={{ fontSize: 11, color: diffColor(t.difficulty) }}>Diff {t.difficulty}/5</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: priorityColor(t.score), background: `${priorityColor(t.score)}18`, padding: "2px 8px", borderRadius: 6 }}>
                        Score {t.score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Topics ── */}
          {activeTab === "topics" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 15, color: C.textMuted }}>{topics.length} topics tracked</div>
                <button onClick={() => setShowAddTopic(true)} style={btnStyle("primary")}>＋ Add Topic</button>
              </div>
              {sorted.map(t => (
                <Card key={t.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                        {t.category && <span style={{ fontSize: 12, color: C.textMuted, background: C.surfaceAlt, padding: "2px 8px", borderRadius: 6 }}>{t.category}</span>}
                        <span style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>
                          {t.studySessions || 0} session{t.studySessions !== 1 ? "s" : ""}
                          {t.lastStudied && ` · last ${Math.floor((Date.now()-new Date(t.lastStudied))/86400000)}d ago`}
                        </span>
                      </div>

                      {/* Editable sliders */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                            <span>My Confidence</span>
                            <span style={{ color: confColor(t.confidence), fontWeight: 700 }}>{t.confidence}/5</span>
                          </div>
                          <input type="range" min={1} max={5} step={1} value={t.confidence}
                            onChange={e => updateTopic(t.id, { confidence: Number(e.target.value) })}
                            style={{ width: "100%", accentColor: confColor(t.confidence) }} />
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim }}>
                            <span>Not confident</span><span>Very confident</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                            <span>Material Difficulty</span>
                            <span style={{ color: diffColor(t.difficulty), fontWeight: 700 }}>{t.difficulty}/5</span>
                          </div>
                          <input type="range" min={1} max={5} step={1} value={t.difficulty}
                            onChange={e => updateTopic(t.id, { difficulty: Number(e.target.value) })}
                            style={{ width: "100%", accentColor: diffColor(t.difficulty) }} />
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim }}>
                            <span>Easy</span><span>Very hard</span>
                          </div>
                        </div>
                      </div>

                      {t.relatedRefs > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12, color: C.accent }}>
                          🔗 {t.relatedRefs} reflection{t.relatedRefs>1?"s":""} linked · effective confidence adjusted to {t.effectiveConfidence}/5
                          {t.avgStress && t.avgStress > 3.5 && " · ⚠️ high stress detected on this topic"}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => markStudied(t.id)} style={{ ...btnStyle("primary"), fontSize: 12, padding: "5px 10px" }}>✓ Studied</button>
                      <button onClick={() => setTopics(ts => ts.filter(x => x.id !== t.id))} style={{ ...btnStyle("secondary"), fontSize: 12, padding: "5px 10px" }}>Remove</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ── TAB: AI Coach ── */}
          {activeTab === "insight" && (
            <div>
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🧠</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Your Personal Study Coach</div>
                    <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
                      Analyzes your topic confidence ratings, difficulty levels, session history, and reflection data
                      to give you a truly personalized recommendation — not just a generic tip.
                    </div>
                  </div>
                </div>

                <button onClick={getAIInsight} disabled={aiLoading}
                  style={{ ...btnStyle("primary"), width: "100%", padding: "12px", fontSize: 14, opacity: aiLoading ? 0.7 : 1 }}>
                  {aiLoading ? "🧠 Analyzing your data..." : "✨ Get My Personalized Recommendation"}
                </button>
              </Card>

              {aiInsight && (
                <Card style={{ border: `2px solid ${C.accent}` }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 24 }}>🎯</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Your Study Coach Says</div>
                  </div>
                  <div style={{ fontSize: 14, color: C.text, lineHeight: 1.8, borderLeft: `3px solid ${C.accent}`, paddingLeft: 16 }}>
                    {aiInsight}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 12, color: C.textMuted }}>
                    Based on {topics.length} topics · {reflections.length} reflections · your personal confidence and difficulty ratings
                  </div>
                  <button onClick={getAIInsight} style={{ ...btnStyle("secondary"), marginTop: 12, fontSize: 12 }}>↺ Refresh</button>
                </Card>
              )}

              {/* What the AI sees */}
              <Card style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>📊 What the AI is analyzing</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Topics tracked", value: topics.length, icon: "📚" },
                    { label: "Study sessions", value: topics.reduce((s,t)=>s+(t.studySessions||0),0), icon: "🍅" },
                    { label: "Reflections linked", value: reflections.length, icon: "✍️" },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: "center", padding: "12px 8px", background: C.surfaceAlt, borderRadius: 8 }}>
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
                  The more topics you add and the more Pomodoro sessions you log with reflections,
                  the smarter and more personalized the recommendations become.
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Add Topic Modal */}
      {showAddTopic && (
        <Modal title="Add Study Topic" onClose={() => setShowAddTopic(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Topic Name" placeholder="e.g. Biochemistry, Organic Chemistry, Psychology" value={newTopic.name} onChange={v => setNewTopic(t => ({ ...t, name: v }))} />
            <Input label="Category / Subject (optional)" placeholder="e.g. MCAT, Biology, Math" value={newTopic.category} onChange={v => setNewTopic(t => ({ ...t, category: v }))} />

            <div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>How confident do you feel right now?</span>
                <span style={{ color: confColor(newTopic.confidence), fontWeight: 700 }}>{["","Not at all","Barely","Somewhat","Pretty good","Very confident"][newTopic.confidence]}</span>
              </div>
              <input type="range" min={1} max={5} step={1} value={newTopic.confidence}
                onChange={e => setNewTopic(t => ({ ...t, confidence: Number(e.target.value) }))}
                style={{ width: "100%", accentColor: confColor(newTopic.confidence) }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textDim }}>
                <span>1 — Not at all</span><span>5 — Very confident</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>How difficult is this material?</span>
                <span style={{ color: diffColor(newTopic.difficulty), fontWeight: 700 }}>{["","Very easy","Easy","Moderate","Hard","Very hard"][newTopic.difficulty]}</span>
              </div>
              <input type="range" min={1} max={5} step={1} value={newTopic.difficulty}
                onChange={e => setNewTopic(t => ({ ...t, difficulty: Number(e.target.value) }))}
                style={{ width: "100%", accentColor: diffColor(newTopic.difficulty) }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textDim }}>
                <span>1 — Very easy</span><span>5 — Very hard</span>
              </div>
            </div>

            {newTopic.difficulty > 0 && newTopic.confidence > 0 && (
              <div style={{ padding: "12px 16px", background: C.accentSoft, borderRadius: 10, fontSize: 13, color: C.accent }}>
                {newTopic.difficulty > newTopic.confidence
                  ? `⚠️ Gap detected — this topic will be ranked high priority (difficulty ${newTopic.difficulty} > confidence ${newTopic.confidence})`
                  : newTopic.confidence > newTopic.difficulty
                  ? `✅ You feel confident here — this will be lower priority`
                  : `📊 Balanced — moderate priority`}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={() => setShowAddTopic(false)} style={{ ...btnStyle("secondary"), flex: 1 }}>Cancel</button>
              <button onClick={addTopic} style={{ ...btnStyle("primary"), flex: 2 }}>Add Topic</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RECURRING ────────────────────────────────────────────────────────────────
function RecurringView() {
  const [recurring, setRecurring] = useLocalStorage("ff_recurring", []);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", className: "", frequency: "weekly", days: [], estimatedPomos: 1 });

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Recurring Tasks</h1>
          <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>Manage your recurring study sessions</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={btnStyle("primary")}>＋ New Recurring Task</button>
      </div>
      {recurring.length === 0
        ? <Card><div style={{ textAlign: "center", color: C.textMuted, padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔁</div>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>No recurring tasks yet</div>
            <button onClick={() => setShowAdd(true)} style={btnStyle("primary")}>Create your first one</button>
          </div></Card>
        : recurring.map(r => (
          <Card key={r.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔁</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{r.frequency} · {r.estimatedPomos} poms</div>
            </div>
            <button onClick={() => setRecurring(rs => rs.filter(x => x.id !== r.id))} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18 }}>×</button>
          </Card>
        ))
      }
      {showAdd && (
        <Modal title="New Recurring Task" onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="Title" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
            <Input label="Class / Subject" value={form.className} onChange={v => setForm(f => ({ ...f, className: v }))} />
            <div>
              <label style={labelStyle()}>Frequency</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} style={inputStyle()}>
                {["daily","weekly","biweekly","monthly"].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <Input label="Estimated Pomodoros" type="number" value={form.estimatedPomos} onChange={v => setForm(f => ({ ...f, estimatedPomos: Number(v) }))} />
            <button onClick={() => {
              if (form.title) { setRecurring(rs => [...rs, { ...form, id: uid() }]); setShowAdd(false); }
            }} style={btnStyle("primary")}>Create Recurring Task</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
function AnalyticsView({ tasks, reflections }) {
  const totalPomos = tasks.reduce((s, t) => s + (t.pomodoros || 0), 0);
  const completedTasks = tasks.filter(t => t.status === "Done").length;
  const avgFocus = reflections.length ? (reflections.reduce((s,r)=>s+(r.focus||0),0)/reflections.length).toFixed(1) : 0;
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i));
    const ds = d.toISOString().slice(0,10);
    return { label: dayNames[d.getDay()], pomos: tasks.filter(t=>t.scheduledDate===ds).reduce((s,t)=>s+(t.pomodoros||0),0) };
  });
  const maxPomos = Math.max(...last7.map(d => d.pomos), 1);
  const statusCounts = STATUSES.map(s => ({ s, count: tasks.filter(t => t.status === s).length }));

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Analytics</h1>
        <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>Track your productivity patterns</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Pomodoros" value={totalPomos} icon="🍅" color={C.tomato} />
        <StatCard label="Tasks Completed" value={completedTasks} icon="✅" color={C.success} />
        <StatCard label="Avg Focus" value={`${avgFocus}/5`} icon="🎯" color={C.accent} />
        <StatCard label="Reflections" value={reflections.length} icon="✍️" color={C.warning} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Daily Pomodoros (Last 7 Days)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130 }}>
            {last7.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>{d.pomos || ""}</div>
                <div style={{ width: "100%", background: `linear-gradient(to top, ${C.accent}, ${C.accentHover})`, borderRadius: "4px 4px 0 0", height: `${(d.pomos/maxPomos)*100}px`, minHeight: d.pomos ? 4 : 0 }} />
                <div style={{ fontSize: 11, color: C.textMuted }}>{d.label}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Tasks by Status</div>
          {statusCounts.map(({ s, count }) => {
            const pct = tasks.length ? (count/tasks.length)*100 : 0;
            const colors = { Backlog: C.textDim, Planned: C.accent, "In Progress": C.warning, Done: C.success };
            return (
              <div key={s} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{s}</span><span style={{ color: C.textMuted }}>{count}</span>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: colors[s], borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      width: 44, height: 24, borderRadius: 12, cursor: "pointer", flexShrink: 0,
      background: checked ? C.accent : C.border, transition: "background 0.2s",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", top: 3, left: checked ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}

function SettingsView({ settings, setSettings, setPage }) {
  const [newTag, setNewTag] = useState("");
  const [newType, setNewType] = useState("");
  const [saved, setSaved] = useState(false);
  const upd = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  const DEFAULT_TASK_TYPES = ["homework", "project", "test", "quiz", "reading", "other"];

  const notifToggles = [
    { key: "notif1minFocus",    label: "1 minute left in focus session",  sub: "Heads-up before your pomodoro ends" },
    { key: "notifPomoComplete", label: "Pomodoro complete",               sub: "Celebrate finishing a session & start break" },
    { key: "notif1minBreak",    label: "1 minute left in break",          sub: "Heads-up before your break ends" },
    { key: "notifBreakOver",    label: "Break over – time to start",      sub: "Reminder to begin your next focus session" },
  ];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: 32, maxWidth: 700 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Settings</h1>
        <div style={{ color: C.textMuted, fontSize: 14, marginTop: 2 }}>Configure your study preferences</div>
      </div>

      {/* Pomodoro Timer */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
          <span style={{ color: C.warning }}>⏱</span> Pomodoro Timer
        </div>
        <SliderSetting label="Focus Duration" value={settings.focusDuration} min={5} max={60} unit="min" onChange={v => upd("focusDuration", v)} />
        <SliderSetting label="Short Break" value={settings.shortBreak} min={1} max={30} unit="min" onChange={v => upd("shortBreak", v)} />
        <SliderSetting label="Long Break" value={settings.longBreak} min={5} max={60} unit="min" onChange={v => upd("longBreak", v)} />
        <SliderSetting label="Pomodoros until Long Break" value={settings.pomosUntilLong} min={2} max={8} onChange={v => upd("pomosUntilLong", v)} />
      </Card>

      {/* Capacity Goals */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
          <span style={{ color: C.accent }}>🎯</span> Capacity Goals
        </div>
        <SliderSetting label="Daily Pomodoro Target" value={settings.dailyCap} min={1} max={20} unit="poms" onChange={v => upd("dailyCap", v)} />
        <SliderSetting label="Weekly Pomodoro Target" value={settings.weeklyCap} min={5} max={100} unit="poms" onChange={v => upd("weeklyCap", v)} />
      </Card>

      {/* Subject Tags */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: C.warning }}>⚡</span> Subject Tags
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>Add your frequently used subject tags for quick access</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={newTag} onChange={e => setNewTag(e.target.value)}
            placeholder="e.g., Math, History, Coding"
            style={{ ...inputStyle(), flex: 1 }}
            onKeyDown={e => { if (e.key === "Enter" && newTag.trim()) { upd("tags", [...(settings.tags||[]), newTag.trim()]); setNewTag(""); } }} />
          <button onClick={() => { if (newTag.trim()) { upd("tags", [...(settings.tags||[]), newTag.trim()]); setNewTag(""); } }} style={btnStyle("primary")}>＋</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(settings.tags||[]).map(t => (
            <span key={t} style={{ padding: "4px 10px", background: C.accentSoft, color: C.accent, borderRadius: 20, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              {t}
              <button onClick={() => upd("tags", settings.tags.filter(x => x !== t))}
                style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      </Card>

      {/* Task Types */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: C.warning }}>⚡</span> Task Types
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
          Default: {DEFAULT_TASK_TYPES.join(", ")}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={newType} onChange={e => setNewType(e.target.value)}
            placeholder="e.g., content, practice, review"
            style={{ ...inputStyle(), flex: 1 }}
            onKeyDown={e => { if (e.key === "Enter" && newType.trim()) { upd("customTaskTypes", [...(settings.customTaskTypes||[]), newType.trim()]); setNewType(""); } }} />
          <button onClick={() => { if (newType.trim()) { upd("customTaskTypes", [...(settings.customTaskTypes||[]), newType.trim()]); setNewType(""); } }} style={btnStyle("primary")}>＋</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(settings.customTaskTypes||[]).map(t => (
            <span key={t} style={{ padding: "4px 10px", background: C.surfaceAlt, color: C.text, borderRadius: 20, fontSize: 13, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 4 }}>
              {t}
              <button onClick={() => upd("customTaskTypes", settings.customTaskTypes.filter(x => x !== t))}
                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      </Card>

      {/* Notifications */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: C.accent }}>🔔</span> Notifications
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
          Choose which browser notifications you want to receive during Pomodoro sessions.
        </div>
        {notifToggles.map(n => (
          <div key={n.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{n.label}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{n.sub}</div>
            </div>
            <Toggle
              checked={settings[n.key] !== false}
              onChange={v => upd(n.key, v)}
            />
          </div>
        ))}
      </Card>

      {/* Recurring Tasks shortcut */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <span style={{ color: C.success }}>🔁</span> Recurring Tasks
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>
          Create tasks that repeat on a schedule (daily, weekly, monthly)
        </div>
        <button
          onClick={() => setPage("recurring")}
          style={{ ...btnStyle("primary"), width: "100%", padding: "12px", borderRadius: 10, fontSize: 14 }}
        >
          ＋ Create Recurring Task
        </button>
      </Card>

      {/* Save Settings */}
      <button
        onClick={handleSave}
        style={{
          width: "100%", padding: "14px", borderRadius: 10, border: "none",
          background: saved ? C.success : C.accent,
          color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          transition: "background 0.3s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {saved ? "✓ Settings Saved!" : "💾 Save Settings"}
      </button>
    </div>
  );
}
