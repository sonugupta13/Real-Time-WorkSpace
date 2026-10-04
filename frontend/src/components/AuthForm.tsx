"use client";

import React, { useState } from "react";
import { authApi } from "../services/api";

interface AuthFormProps {
  onAuthSuccess: (token: string, refreshToken: string, user: any) => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const res = await authApi.login({ email, password });
        if (res.error) {
          setError(res.error);
        } else if (res.data) {
          onAuthSuccess(res.data.tokens.accessToken, res.data.tokens.refreshToken, res.data.user);
        }
      } else {
        if (!name.trim()) {
          setError("Name is required for signup");
          setLoading(false);
          return;
        }
        const res = await authApi.signup({ name, email, password });
        if (res.error) {
          setError(res.error);
        } else if (res.data) {
          onAuthSuccess(res.data.tokens.accessToken, res.data.tokens.refreshToken, res.data.user);
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function fillDemoAccount(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setIsLogin(true);
    setError(null);
  }

  return (
    <div style={{ maxWidth: 440, margin: "60px auto", padding: "0 16px" }}>
      <div className="cream-card" style={{ padding: "32px 28px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="brand-mark" style={{ justifyContent: "center", marginBottom: 12 }}>
            <span className="brand-dot" />
            <span>CollabSpace RBAC</span>
          </div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {isLogin ? "Sign In to Your Workspace" : "Create New Account"}
          </h2>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: 6 }}>
            {isLogin
              ? "Access your multi-tenant boards and real-time tasks"
              : "Register to create workspaces and collaborate with your team"}
          </p>
        </div>

        {error && (
          <div className="alert-banner alert-error" style={{ marginBottom: 20 }}>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                id="signup-name-input"
                type="text"
                className="form-input"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              id="auth-email-input"
              type="email"
              className="form-input"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              id="auth-password-input"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            disabled={loading}
          >
            {loading ? "Authenticating..." : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {isLogin ? "Don't have an account yet?" : "Already have an account?"}{" "}
            <button
              id="auth-toggle-mode-btn"
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-warm)",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        <div style={{ marginTop: 24, padding: "14px", background: "var(--bg-surface-subtle)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
            Quick Demo Autofill:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-mini"
              onClick={() => fillDemoAccount("alice@example.com", "Password123!")}
            >
              Alice (Owner)
            </button>
            <button
              type="button"
              className="btn-mini"
              onClick={() => fillDemoAccount("bob@example.com", "Password123!")}
            >
              Bob (Member)
            </button>
            <button
              type="button"
              className="btn-mini"
              onClick={() => fillDemoAccount("owner@test.com", "Password123!")}
            >
              Owner Test
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
