/**
 * middleware.ts — Next.js Edge Middleware for protected route guarding.
 *
 * Runs at the Edge Runtime (before any React rendering) for all routes
 * matching the config.matcher pattern. Redirects unauthenticated users
 * to /login before any dashboard page loads.
 *
 * Authentication Strategy:
 *   The Edge Runtime cannot run Firebase Admin SDK (Node.js only).
 *   Instead, we check for the presence of 'omniface_session' cookie — a
 *   lightweight flag set by auth.ts on login/register. This is a presence
 *   check, NOT a cryptographic verification. The actual Firebase JWT
 *   verification happens on the FastAPI backend on every API call.
 *
 * Flow:
 *   1. User logs in → auth.ts sets document.cookie = 'omniface_session=1'
 *   2. User navigates to /dashboard → middleware checks for cookie
 *   3. Cookie present → NextResponse.next() (allow through)
 *   4. Cookie absent → redirect to /login?from=/dashboard
 *   5. All API calls → FastAPI verifies Firebase JWT (real auth)
 */

import { NextRequest, NextResponse } from 'next/server';

/** Routes that require authentication. All sub-paths are automatically covered. */
const PROTECTED_PREFIXES = ['/dashboard'];

/** Routes where already-authenticated users should be redirected away. */
const AUTH_ROUTES = ['/login', '/register'];

/** Name of the session presence cookie set by auth.ts. */
const SESSION_COOKIE = 'omniface_session';

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const isAuthenticated = !!sessionCookie;

  // ── Protected route accessed without session ──────────────────────────────
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Auth route accessed while already authenticated ───────────────────────
  // (Optional UX improvement: redirect logged-in users away from /login)
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

/**
 * Matcher config — middleware only runs on these path patterns.
 * Excludes static files, Next.js internals, and API routes.
 */
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/register',
  ],
};
