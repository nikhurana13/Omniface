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

export type UserProfile = User;

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
      }
    }
  },
};
