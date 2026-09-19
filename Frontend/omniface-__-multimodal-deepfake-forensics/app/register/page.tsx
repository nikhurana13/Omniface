'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Lock, Mail, User, ArrowRight, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { authService } from '@/lib/api/auth';
import VerificationScreen from '@/components/VerificationScreen';

export default function StandaloneRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTOS, setAgreeTOS] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    const user = authService.getCurrentUser();
    if (user) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!agreeTOS) {
      setErrorMessage('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setIsLoading(true);
    const res = await authService.register(name.trim(), email.trim(), password, confirmPassword);
    setIsLoading(false);

    if (res.needsVerification) {
      setUnverifiedEmail(res.email || email.trim());
    } else if (res.success) {
      setSuccessMessage('Account created successfully! Launching dashboard...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 600);
    } else {
      setErrorMessage(res.error || 'Failed to register account.');
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    const res = await authService.loginWithGoogle();
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Google verification successful. Launching workspace...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 600);
    } else {
      setErrorMessage(res.error || 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      backgroundColor: '#06080D',
      color: '#FFFFFF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      overflow: 'hidden',
    }}>
      {/* Background Fluid Video */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          src="/assets/section2-bg.mp4"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, filter: 'brightness(0.6)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(6,8,13,0.7) 0%, rgba(6,8,13,0.95) 100%)' }} />
      </div>

      {/* Main Card */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: '460px',
        backgroundColor: 'rgba(13, 17, 26, 0.88)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(0, 229, 255, 0.25)',
        borderRadius: '20px',
        padding: 'clamp(28px, 4vw, 40px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 229, 255, 0.15)',
      }}>
        {unverifiedEmail ? (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0, 229, 255, 0.12)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00E5FF',
                }}>
                  <ShieldCheck size={18} />
                </div>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: '15px', fontWeight: 800, letterSpacing: '0.08em', color: '#FFFFFF' }}>
                  OMNIFACE
                </span>
              </Link>
            </div>
            <VerificationScreen
              email={unverifiedEmail}
              loginHref="/login"
              allowResend={false}
            />
          </div>
        ) : (
          <>
            {/* Brand */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0, 229, 255, 0.12)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00E5FF',
                }}>
                  <ShieldCheck size={20} />
                </div>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: '16px', fontWeight: 800, letterSpacing: '0.08em', color: '#FFFFFF' }}>
                  OMNIFACE
                </span>
              </Link>

              <h1 style={{ fontFamily: 'var(--f-display)', fontSize: '22px', fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>
                CREATE FORENSIC ACCOUNT
              </h1>
              <p style={{ fontFamily: 'var(--f-sans)', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)' }}>
                Join the decentralized deepfake detection network
              </p>
            </div>

            {/* Alerts */}
            {errorMessage && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#F87171',
                fontSize: '12.5px',
                marginBottom: '16px',
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#34D399',
                fontSize: '12.5px',
                marginBottom: '16px',
              }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255, 255, 255, 0.75)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)' }} />
                  <input
                    type="text"
                    placeholder="Dr. Evelyn Vance"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '10px 14px 10px 38px',
                      color: '#FFFFFF',
                      fontFamily: 'var(--f-sans)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255, 255, 255, 0.75)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)' }} />
                  <input
                    type="email"
                    placeholder="investigator@agency.gov"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '10px 14px 10px 38px',
                      color: '#FFFFFF',
                      fontFamily: 'var(--f-sans)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255, 255, 255, 0.75)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)' }} />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '10px 14px 10px 38px',
                      color: '#FFFFFF',
                      fontFamily: 'var(--f-sans)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255, 255, 255, 0.75)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)' }} />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '10px 14px 10px 38px',
                      color: '#FFFFFF',
                      fontFamily: 'var(--f-sans)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Checkbox */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="tos-check"
                  checked={agreeTOS}
                  onChange={(e) => setAgreeTOS(e.target.checked)}
                  style={{ marginTop: '2px', accentColor: '#00E5FF', cursor: 'pointer' }}
                />
                <label htmlFor="tos-check" style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer' }}>
                  I agree to the <span style={{ color: '#00E5FF' }}>Terms of Service</span> and <span style={{ color: '#00E5FF' }}>Privacy Policy</span>.
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#00E5FF',
                  border: 'none',
                  color: '#06080D',
                  fontFamily: 'var(--f-display)',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 0 20px rgba(0, 229, 255, 0.35)',
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>CREATING ACCOUNT...</span>
                  </>
                ) : (
                  <>
                    <span>CREATE ACCOUNT</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0 14px 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                color: '#FFFFFF',
                fontFamily: 'var(--f-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Switch Link */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'center', fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.6)' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#00E5FF', fontWeight: 600, textDecoration: 'none' }}>
                LOG IN
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
