import { useEffect, useRef, useState } from "react";
import {
  Camera, CheckCircle2, ChevronRight, Eye, EyeOff,
  KeyRound, Loader2, Mail, Save, Shield, Trash2, Upload, UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

/* ─── Shared sub-components ─── */

function FieldLabel({ children, htmlFor }) {
  return (
    <label
      className="text-[13px] font-semibold text-[#474D57]"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

function StyledInput({ id, type = "text", value, onChange, readOnly = false, placeholder, icon: Icon, minLength }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          aria-hidden="true"
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B7BDC6] pointer-events-none"
        />
      )}
      <input
        className="h-11 w-full border border-[#E6E8EA] bg-white px-3.5 text-[14px] text-[#1E2026] outline-none transition-all focus:border-[#F0B90B] focus:shadow-[0_0_0_3px_rgba(240,185,11,0.08)]"
        id={id}
        minLength={minLength}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          borderRadius: "10px",
          paddingLeft: Icon ? "2.75rem" : "0.875rem",
          ...(readOnly
            ? { background: "#FAFAFA", color: "#848E9C", cursor: "default" }
            : {}),
        }}
        type={type}
        value={value}
      />
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder, minLength }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="relative">
      <KeyRound
        aria-hidden="true"
        size={16}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B7BDC6] pointer-events-none"
      />
      <input
        className="h-11 w-full border border-[#E6E8EA] bg-white pl-[2.75rem] pr-11 text-[14px] text-[#1E2026] outline-none transition-all focus:border-[#F0B90B] focus:shadow-[0_0_0_3px_rgba(240,185,11,0.08)]"
        id={id}
        minLength={minLength}
        onChange={onChange}
        placeholder={placeholder}
        style={{ borderRadius: "10px" }}
        type={showPassword ? "text" : "password"}
        value={value}
      />
      <button
        aria-label={showPassword ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 text-[#B7BDC6] bg-transparent border-none cursor-pointer hover:text-[#474D57] transition-colors"
        onClick={() => setShowPassword((prev) => !prev)}
        type="button"
        style={{ borderRadius: "6px" }}
      >
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function StatusMessage({ type, children }) {
  if (!children) return null;
  const styles = {
    error: {
      bg: "#FEF2F2",
      border: "#FECACA",
      color: "#DC2626",
      icon: "⚠",
    },
    success: {
      bg: "#F0FDF4",
      border: "#BBF7D0",
      color: "#16A34A",
      icon: "✓",
    },
  };
  const s = styles[type] || styles.error;
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium"
      role={type === "error" ? "alert" : "status"}
      style={{
        borderRadius: "10px",
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
      }}
    >
      <span>{s.icon}</span>
      {children}
    </div>
  );
}

function AuthMethodBadge({ icon: Icon, label, active }) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3 border"
      style={{
        borderRadius: "10px",
        background: active ? "#F0FDF4" : "#FAFAFA",
        borderColor: active ? "#BBF7D0" : "#E6E8EA",
      }}
    >
      <div
        className="w-8 h-8 flex items-center justify-center shrink-0"
        style={{
          borderRadius: "8px",
          background: active
            ? "rgba(22, 163, 74, 0.1)"
            : "rgba(132, 142, 156, 0.1)",
        }}
      >
        <Icon
          size={16}
          style={{ color: active ? "#16A34A" : "#848E9C" }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#1E2026] m-0">
          {label}
        </p>
        <p
          className="text-[11px] m-0 mt-0.5"
          style={{ color: active ? "#16A34A" : "#848E9C" }}
        >
          {active ? "Connected" : "Not connected"}
        </p>
      </div>
      {active && (
        <CheckCircle2
          size={16}
          className="ml-auto shrink-0"
          style={{ color: "#16A34A" }}
        />
      )}
    </div>
  );
}

/* ─── Main AccountPage ─── */

export function AccountPage() {
  const { changePassword, updateProfile, uploadAvatar, removeAvatar, user, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarSuccess, setAvatarSuccess] = useState("");
  const avatarInputRef = useRef(null);

  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
  }, [user?.display_name]);

  function handleAccountError(error, setError, fallbackMessage = "This account action could not be completed.") {
    if (error instanceof ApiError && error.status === 401) {
      logout();
      return;
    }
    setError(error.message || fallbackMessage);
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setProfileStatus("");
      setProfileError("Display name is required.");
      return;
    }

    setProfileError("");
    setProfileStatus("");
    setIsSavingProfile(true);

    try {
      await updateProfile({ display_name: nextDisplayName });
      setProfileStatus("Profile updated successfully.");
    } catch (error) {
      handleAccountError(error, setProfileError, "Profile could not be updated.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordStatus("");

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus("Password changed successfully.");
    } catch (error) {
      handleAccountError(error, setPasswordError, "Password could not be changed.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  const hasPassword = Boolean(user?.has_password);
  const googleLinked = Boolean(user?.google_linked);
  const initial = (user?.display_name || user?.email || "U")[0]?.toUpperCase();
  const avatarUrl = user?.avatar_url ? `${API_BASE_URL}${user.avatar_url}` : null;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })
    : "—";

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    // reset input so same file can be re-selected
    event.target.value = "";

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setAvatarError("Image must be smaller than 5 MB.");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setAvatarError("Only JPEG, PNG, WebP, and GIF images are accepted.");
      return;
    }

    setAvatarError("");
    setAvatarSuccess("");
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      setAvatarSuccess("Avatar updated!");
      setTimeout(() => setAvatarSuccess(""), 3000);
    } catch (err) {
      handleAccountError(err, setAvatarError, "Upload failed.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarError("");
    setAvatarSuccess("");
    setIsUploadingAvatar(true);
    try {
      await removeAvatar();
      setAvatarSuccess("Avatar removed.");
      setTimeout(() => setAvatarSuccess(""), 3000);
    } catch (err) {
      handleAccountError(err, setAvatarError, "Remove failed.");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-[820px] mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px] text-[#848E9C] mb-6">
          <Link
            to="/dashboard"
            className="hover:text-[#1E2026] transition-colors no-underline text-[#848E9C]"
          >
            Dashboard
          </Link>
          <ChevronRight size={14} className="opacity-50" />
          <span className="text-[#1E2026] font-semibold">Account</span>
        </nav>

        {/* Profile header card */}
        <div
          className="bg-white border border-[#E6E8EA] p-6 mb-6"
          style={{
            borderRadius: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative group">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
                aria-label="Upload avatar"
              />
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${user?.display_name || "User"} avatar`}
                  className="w-20 h-20 object-cover shrink-0"
                  style={{ borderRadius: "50%", border: "3px solid #F0B90B" }}
                />
              ) : (
                <div
                  className="w-20 h-20 bg-gradient-to-br from-[#F0B90B] to-[#E5A800] flex items-center justify-center text-[#1E2026] font-bold text-2xl shrink-0"
                  style={{ borderRadius: "50%" }}
                >
                  {initial}
                </div>
              )}
              {/* Hover overlay */}
              <button
                type="button"
                aria-label="Change avatar"
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait border-0 p-0"
                style={{ borderRadius: "50%" }}
                onClick={() => !isUploadingAvatar && avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                title="Change avatar"
              >
                {isUploadingAvatar ? (
                  <Loader2 size={22} className="text-white animate-spin" />
                ) : (
                  <Camera size={22} className="text-white" />
                )}
              </button>
              {/* Remove button */}
              {avatarUrl && !isUploadingAvatar && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  title="Remove avatar"
                  aria-label="Remove avatar"
                  className="absolute -bottom-1 -right-1 w-7 h-7 flex items-center justify-center bg-white border border-[#E6E8EA] shadow-sm hover:bg-red-50 hover:border-red-300 transition-all"
                  style={{ borderRadius: "50%" }}
                >
                  <Trash2 size={13} className="text-[#848E9C] hover:text-red-500" />
                </button>
              )}
            </div>

            {/* Name + meta */}
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-bold text-[#1E2026] tracking-tight m-0">
                {user?.display_name || "User"}
              </h1>
              <p className="text-[14px] text-[#848E9C] m-0 mt-1">
                {user?.email}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    borderRadius: "6px",
                    background: "#FFF8E6",
                    color: "#B8860B",
                  }}
                >
                  Member since {memberSince}
                </span>
              </div>
              {/* Avatar upload feedback */}
              {avatarError && (
                <p className="text-[12px] text-red-500 m-0 mt-1.5 font-medium">{avatarError}</p>
              )}
              {avatarSuccess && (
                <p className="text-[12px] text-emerald-600 m-0 mt-1.5 font-medium flex items-center gap-1">
                  <CheckCircle2 size={13} /> {avatarSuccess}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Two-column grid for Profile + Security */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ─── Profile Section ─── */}
          <div
            className="bg-white border border-[#E6E8EA]"
            style={{
              borderRadius: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            {/* Section header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#F0F0F0]">
              <div
                className="w-9 h-9 flex items-center justify-center shrink-0"
                style={{
                  borderRadius: "10px",
                  background: "rgba(240, 185, 11, 0.1)",
                }}
              >
                <UserRound size={18} className="text-[#F0B90B]" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-[#1E2026] m-0">
                  Profile
                </h2>
                <p className="text-[12px] text-[#848E9C] m-0 mt-0.5">
                  Your public display information
                </p>
              </div>
            </div>

            {/* Form */}
            <form className="p-6 flex flex-col gap-5" onSubmit={handleProfileSubmit}>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="account-display-name">
                  Display Name
                </FieldLabel>
                <StyledInput
                  id="account-display-name"
                  icon={UserRound}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  value={displayName}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="account-email">Email Address</FieldLabel>
                <StyledInput
                  icon={Mail}
                  id="account-email"
                  readOnly
                  type="email"
                  value={user?.email ?? ""}
                />
                <p className="text-[11px] text-[#B7BDC6] m-0 ml-1">
                  Email cannot be changed
                </p>
              </div>

              <StatusMessage type="error">{profileError}</StatusMessage>
              <StatusMessage type="success">{profileStatus}</StatusMessage>

              <div className="pt-1">
                <button
                  className="inline-flex h-10 items-center gap-2 px-5 border-none text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSavingProfile}
                  style={{
                    borderRadius: "10px",
                    background: "#F0B90B",
                    color: "#1E2026",
                    transition: "all 150ms ease",
                  }}
                  type="submit"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FFD000";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(240,185,11,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#F0B90B";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <Save aria-hidden="true" size={15} />
                  {isSavingProfile ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>

          {/* ─── Security Section ─── */}
          <div
            className="bg-white border border-[#E6E8EA]"
            style={{
              borderRadius: "16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            {/* Section header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#F0F0F0]">
              <div
                className="w-9 h-9 flex items-center justify-center shrink-0"
                style={{
                  borderRadius: "10px",
                  background: "rgba(240, 185, 11, 0.1)",
                }}
              >
                <Shield size={18} className="text-[#F0B90B]" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-[#1E2026] m-0">
                  Security
                </h2>
                <p className="text-[12px] text-[#848E9C] m-0 mt-0.5">
                  Sign-in methods &amp; password
                </p>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {/* Auth methods */}
              <div>
                <p className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider m-0 mb-2.5">
                  Sign-in Methods
                </p>
                <div className="flex flex-col gap-2">
                  <AuthMethodBadge
                    active={hasPassword}
                    icon={KeyRound}
                    label="Password"
                  />
                  <AuthMethodBadge
                    active={googleLinked}
                    icon={() => (
                      <svg
                        height="16"
                        viewBox="0 0 18 18"
                        width="16"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                          fill="#4285F4"
                        />
                        <path
                          d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                          fill="#34A853"
                        />
                        <path
                          d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                          fill="#EA4335"
                        />
                      </svg>
                    )}
                    label="Google"
                  />
                </div>
              </div>

              {/* Change password form */}
              {hasPassword ? (
                <form
                  className="flex flex-col gap-4 pt-2 border-t border-[#F0F0F0]"
                  onSubmit={handlePasswordSubmit}
                >
                  <p className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider m-0">
                    Change Password
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor="account-current-password">
                      Current Password
                    </FieldLabel>
                    <PasswordInput
                      id="account-current-password"
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      value={currentPassword}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor="account-new-password">
                      New Password
                    </FieldLabel>
                    <PasswordInput
                      id="account-new-password"
                      minLength={8}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      value={newPassword}
                    />
                  </div>

                  <StatusMessage type="error">{passwordError}</StatusMessage>
                  <StatusMessage type="success">
                    {passwordStatus}
                  </StatusMessage>

                  <div className="pt-1">
                    <button
                      className="inline-flex h-10 items-center gap-2 px-5 border border-[#E6E8EA] bg-white text-[13px] font-semibold text-[#1E2026] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isChangingPassword}
                      style={{
                        borderRadius: "10px",
                        transition: "all 150ms ease",
                      }}
                      type="submit"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#F5F5F5";
                        e.currentTarget.style.borderColor = "#D0D5DD";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#FFFFFF";
                        e.currentTarget.style.borderColor = "#E6E8EA";
                      }}
                    >
                      <KeyRound aria-hidden="true" size={15} />
                      {isChangingPassword
                        ? "Updating..."
                        : "Update Password"}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  className="border border-[#E6E8EA] px-4 py-4"
                  style={{
                    borderRadius: "10px",
                    background: "#FAFAFA",
                  }}
                >
                  <p className="text-[13px] font-semibold text-[#474D57] m-0">
                    Password sign-in is not enabled
                  </p>
                  <p className="text-[12px] text-[#848E9C] m-0 mt-1">
                    You're using Google to sign in. Local password setup is
                    not available for this account.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
