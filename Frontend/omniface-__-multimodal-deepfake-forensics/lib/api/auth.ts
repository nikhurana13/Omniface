'use client';

/**
 * lib/api/auth.ts — Real Firebase Authentication Service.
 *
 * Security & Implementation Details:
 * - Uses the official Firebase Auth SDK (modular v11+).
 * - Real user sign-in, account creation, token refresh, and sign-out.
 * - ID tokens are cryptographically signed Firebase JWTs verified by the FastAPI backend.
 * - Never trusts client-side state alone; tokens are forwarded as Bearer tokens to backend.
 * - Handles auth loading, session changes, and expired sessions via onAuthStateChanged.
 * - Preserves the existing exported interface and TypeScript contracts so UI is not disrupted.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
  AuthError,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'investigator' | 'analyst' | 'admin';
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

const AUTH_KEY = 'omniface_auth_user';
const TOKEN_KEY = 'omniface_auth_token';

/**
 * Helper to map a Firebase User object to the application's User model.
 */
function mapFirebaseUser(fbUser: FirebaseUser): User {
  const email = fbUser.email || '';
  const fallbackName = email.includes('@')
    ? email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1)
    : 'Analyst';

  return {
    id: fbUser.uid,
    name: fbUser.displayName || fallbackName,
    email: email,
    avatarUrl: fbUser.photoURL || undefined,
    role: 'investigator',
    createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
  };
}

/**
 * Map Firebase Auth error codes to user-friendly error messages.
 */
function mapAuthError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const authErr = error as AuthError;
    switch (authErr.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password. Please verify your credentials.';
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Access temporarily blocked due to multiple failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      default:
        return authErr.message || 'Authentication failed. Please try again.';
    }
  }
  return (error as Error)?.message || 'An unexpected authentication error occurred.';
}

export const authService = {
  /**
   * Login with email & password via Firebase Auth.
   */
  login: async (email: string, password: string): Promise<AuthResponse> => {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = userCredential.user;
      const token = await fbUser.getIdToken();
      const user = mapFirebaseUser(fbUser);

      // Cache session in localStorage for instant render hydration
      if (typeof window !== 'undefined') {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        localStorage.setItem(TOKEN_KEY, token);
      }

      return { success: true, token, user };
    } catch (err: unknown) {
      return { success: false, error: mapAuthError(err) };
    }
  },

  /**
   * Register a new user with Firebase Auth.
   */
  register: async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ): Promise<AuthResponse> => {
    if (!name || name.trim().length < 2) {
      return { success: false, error: 'Please enter your full name.' };
    }
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = userCredential.user;

      // Update user display name in Firebase profile
      try {
        await updateProfile(fbUser, { displayName: name.trim() });
      } catch {
        // Non-critical profile update failure
      }

      const token = await fbUser.getIdToken();
      const user: User = {
        id: fbUser.uid,
        name: name.trim(),
        email: fbUser.email || email.trim(),
        role: 'investigator',
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        localStorage.setItem(TOKEN_KEY, token);
      }

      return { success: true, token, user };
    } catch (err: unknown) {
      return { success: false, error: mapAuthError(err) };
    }
  },

  /**
   * Get the current logged-in user synchronously from local cache or Firebase state.
   */
  getCurrentUser: (): User | null => {
    if (auth.currentUser) {
      return mapFirebaseUser(auth.currentUser);
    }
    if (typeof window === 'undefined') return null;
    try {
      const data = localStorage.getItem(AUTH_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  /**
   * Check if authenticated.
   */
  isAuthenticated: (): boolean => {
    if (auth.currentUser) return true;
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Get the current valid Firebase ID token (refreshes expired token automatically).
   */
  getIdToken: async (forceRefresh: boolean = false): Promise<string | null> => {
    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken(forceRefresh);
        if (typeof window !== 'undefined') {
          localStorage.setItem(TOKEN_KEY, token);
        }
        return token;
      } catch (err) {
        console.error('Failed to retrieve fresh Firebase ID token:', err);
      }
    }
    if (typeof window !== 'undefined') {
      return localStorage.getItem(TOKEN_KEY);
    }
    return null;
  },

  /**
   * Subscribe to Firebase Auth state changes.
   */
  onAuthStateChange: (callback: (user: User | null) => void): (() => void) => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          const user = mapFirebaseUser(fbUser);
          if (typeof window !== 'undefined') {
            localStorage.setItem(AUTH_KEY, JSON.stringify(user));
            localStorage.setItem(TOKEN_KEY, token);
          }
          callback(user);
        } catch {
          callback(null);
        }
      } else {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(AUTH_KEY);
          localStorage.removeItem(TOKEN_KEY);
        }
        callback(null);
      }
    });
  },

  /**
   * Logout from Firebase Auth.
   */
  logout: async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Firebase signOut error:', err);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(TOKEN_KEY);
        // Clear session presence cookie (read by Next.js middleware)
        document.cookie = 'omniface_session=; path=/; max-age=0; SameSite=Lax';
      }
    }
  },
};

// ── Set session cookie on login / register / auth-state-change ────────────────
// The cookie is a lightweight presence signal used by Next.js middleware to
// protect dashboard routes server-side (edge runtime). It does NOT contain
// the actual token — the Firebase ID token stays in localStorage.
function _setSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'omniface_session=1; path=/; SameSite=Lax';
}

// Patch login / register / onAuthStateChange to also set the session cookie.
// We use module-level init so existing authService callers are unaffected.
if (typeof window !== 'undefined') {
  const _origLogin = authService.login.bind(authService);
  authService.login = async (...args) => {
    const result = await _origLogin(...args);
    if (result.success) _setSessionCookie();
    return result;
  };

  const _origRegister = authService.register.bind(authService);
  authService.register = async (...args) => {
    const result = await _origRegister(...args);
    if (result.success) _setSessionCookie();
    return result;
  };
}


// ── fetchWithAuth — Authenticated fetch interceptor ───────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

/**
 * Fetch wrapper that automatically attaches a Firebase Bearer token.
 *
 * On 401 response:
 *   1. Forces a token refresh (Firebase SDK fetches a new token from Google).
 *   2. Retries the original request once with the refreshed token.
 *   3. If still 401: calls logout() and redirects to /login.
 *
 * Usage:
 *   const res = await fetchWithAuth('/api/v1/reports');
 *   const data = await res.json();
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const attachToken = async (forceRefresh = false): Promise<RequestInit> => {
    const token = await authService.getIdToken(forceRefresh);
    return {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  };

  // First attempt
  let response = await fetch(url, await attachToken());

  if (response.status === 401) {
    // Force-refresh the Firebase token and retry once
    response = await fetch(url, await attachToken(true));

    if (response.status === 401) {
      // Token is unrecoverable — sign out and redirect to login
      await authService.logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  return response;
}


// ── getProfile — Fetch current user profile from backend ─────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  avatar_url?: string | null;
  createdAt?: string;
  created_at?: string | null;
  last_login_at?: string | null;
}

/**
 * Fetch the authenticated user's profile from GET /api/v1/auth/me.
 * Returns null if unauthenticated or on any network error.
 */
export async function getProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetchWithAuth('/api/v1/auth/me');
    if (!res.ok) return null;
    return res.json() as Promise<UserProfile>;
  } catch {
    return null;
  }
}


// ── serverLogout — Backend token revocation ───────────────────────────────────

/**
 * Revoke the user's Firebase refresh tokens server-side via POST /api/v1/auth/logout,
 * then sign out from Firebase client-side.
 *
 * Server-side revocation invalidates all sessions across all devices.
 * Client-side signOut() clears the local Firebase state.
 */
export async function serverLogout(): Promise<void> {
  try {
    await fetchWithAuth('/api/v1/auth/logout', { method: 'POST' });
  } catch {
    // Non-critical — local logout still proceeds
  }
  await authService.logout();
}

