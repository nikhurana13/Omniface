'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { authService } from '@/lib/api/auth';
import VerificationScreen from '@/components/VerificationScreen';

interface AuthSectionProps {
  onScrollTo?: (id: string) => void;
}

export default function AuthSection({ onScrollTo }: AuthSectionProps) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regAgreeTOS, setRegAgreeTOS] = useState(false);

  // Status state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!loginEmail.trim() || !loginEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!loginPassword || loginPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    const res = await authService.login(loginEmail.trim(), loginPassword);
    setIsLoading(false);

    if (res.needsVerification) {
      setUnverifiedEmail(res.email || loginEmail.trim());
    } else if (res.success) {
      setSuccessMessage('Authentication successful! Launching workspace...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 700);
    } else {
      setErrorMessage(res.error || 'Authentication failed. Please verify credentials.');
    }
  };

  // Handle Register Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!regName.trim() || regName.trim().length < 2) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!regAgreeTOS) {
      setErrorMessage('You must accept the Terms of Service to continue.');
      return;
    }

    setIsLoading(true);
    const res = await authService.register(regName.trim(), regEmail.trim(), regPassword, regConfirmPassword);
    setIsLoading(false);

    if (res.needsVerification) {
      setUnverifiedEmail(res.email || regEmail.trim());
    } else if (res.success) {
      setSuccessMessage('Account created successfully! Launching workspace...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 700);
    } else {
      setErrorMessage(res.error || 'Registration failed. Please try again.');
    }
  };

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    const res = await authService.loginWithGoogle();
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Google verification successful! Launching workspace...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 700);
    } else {
      setErrorMessage(res.error || 'Google sign-in failed. Please try again.');
    }
  };

  // Handle Forgot Password
  const handleForgotPassword = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginEmail.trim() || !loginEmail.includes('@')) {
      setErrorMessage('Please enter your email address to reset your password.');
      return;
    }

    setIsLoading(true);
    const res = await authService.sendPasswordReset(loginEmail.trim());
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Password reset email sent. Please check your inbox.');
    } else {
      setErrorMessage(res.error || 'Failed to send password reset email. Please try again.');
    }
  };

  return (
    <footer className="page-section" id="auth-section" style={{ position: 'relative', zIndex: 10, paddingBottom: '72px' }}>
      {/* Primary Auth Container */}
      <div
        className="forensic-card"
        id="auth-main-card"
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.05) 0%, rgba(10, 16, 26, 0.45) 45%, rgba(6, 10, 16, 0.60) 100%)',
          border: 'none',
          padding: 'clamp(28px, 5vh, 48px)',
          boxShadow: '0 24px 72px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header Content */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00E5FF', boxShadow: '0 0 8px #00E5FF' }} />
            <span style={{ fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#00E5FF', textTransform: 'uppercase' }}>
              ACCESS GATEWAY // AUTHORIZATION
            </span>
          </div>

          <h2
            className="section-title"
            style={{
              fontSize: 'clamp(2rem, 3.8vw, 3rem)',
              letterSpacing: '0.02em',
              marginBottom: '10px',
              textShadow: '0 0 30px rgba(0, 229, 255, 0.25)',
            }}
          >
            VERIFY WHAT&apos;S REAL.
          </h2>

          <p style={{ fontSize: '14.5px', color: 'rgba(255, 255, 255, 0.8)', maxWidth: '540px', margin: '0 auto', lineHeight: 1.55 }}>
            Create an account or sign in to analyze videos, images, and audio for potential deepfake manipulation.
          </p>
        </div>

        {unverifiedEmail ? (
          <VerificationScreen
            email={unverifiedEmail}
            onLoginClick={() => {
              setUnverifiedEmail(null);
              setAuthMode('login');
              setErrorMessage(null);
            }}
            loginHref="/login"
            allowResend={false}
          />
        ) : (
          <>
            {/* Tab Switcher */}
            <div
              style={{
                display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '28px',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '4px',
            borderRadius: '100px',
            maxWidth: '320px',
            margin: '0 auto 28px auto',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <button
            type="button"
            className={`modality-tab-btn ${authMode === 'login' ? 'active' : ''}`}
            style={{ flex: 1, justifyContent: 'center', padding: '8px 16px', fontSize: '11px' }}
            onClick={() => {
              setAuthMode('login');
              setErrorMessage(null);
            }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`modality-tab-btn ${authMode === 'register' ? 'active' : ''}`}
            style={{ flex: 1, justifyContent: 'center', padding: '8px 16px', fontSize: '11px' }}
            onClick={() => {
              setAuthMode('register');
              setErrorMessage(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* Inline Feedback Alerts */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(255, 77, 77, 0.12)',
              border: '1px solid rgba(255, 77, 77, 0.4)',
              color: '#FF4D4D',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(0, 245, 160, 0.12)',
              border: '1px solid rgba(0, 245, 160, 0.4)',
              color: '#00F5A0',
              fontSize: '13px',
              marginBottom: '20px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {authMode === 'login' ? (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={16} color="rgba(255, 255, 255, 0.4)" style={{ position: 'absolute', left: '14px' }} />
                <input
                  type="email"
                  placeholder="analyst@agency.gov"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    borderRadius: '8px',
                    background: 'rgba(13, 17, 26, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#00E5FF')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11.5px', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#00E5FF',
                    fontSize: '11.5px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    padding: 0,
                  }}
                >
                  Forgot Password?
                </button>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={16} color="rgba(255, 255, 255, 0.4)" style={{ position: 'absolute', left: '14px' }} />
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    borderRadius: '8px',
                    background: 'rgba(13, 17, 26, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#00E5FF')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="hero-primary-btn"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '14px',
                fontSize: '13px',
                marginTop: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.75 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>LOGGING IN...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>LOG IN TO WORKSPACE</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '14px 0 10px 0' }}>
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
                padding: '12px 16px',
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

            {/* Quick Demo Shortcut */}
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('demo.investigator@omniface.ai');
                  setLoginPassword('password123');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Fill with Demo Investigator Credentials
              </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', marginTop: '16px' }}>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setErrorMessage(null);
                }}
                style={{ background: 'none', border: 'none', color: '#00E5FF', fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                Create Account
              </button>
            </div>
          </form>
        ) : (
          /* REGISTRATION FORM */
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Full Name
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <UserIcon size={16} color="rgba(255, 255, 255, 0.4)" style={{ position: 'absolute', left: '14px' }} />
                <input
                  type="text"
                  placeholder="Sarah Vance"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    borderRadius: '8px',
                    background: 'rgba(13, 17, 26, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#00F5A0')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={16} color="rgba(255, 255, 255, 0.4)" style={{ position: 'absolute', left: '14px' }} />
                <input
                  type="email"
                  placeholder="sarah.vance@forensics.org"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    borderRadius: '8px',
                    background: 'rgba(13, 17, 26, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#00F5A0')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock size={16} color="rgba(255, 255, 255, 0.4)" style={{ position: 'absolute', left: '14px' }} />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '12px 16px 12px 42px',
                      borderRadius: '8px',
                      background: 'rgba(13, 17, 26, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#00F5A0')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontFamily: 'var(--f-display)', fontWeight: 700, color: 'rgba(255, 255, 255, 0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Lock size={16} color="rgba(255, 255, 255, 0.4)" style={{ position: 'absolute', left: '14px' }} />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '12px 16px 12px 42px',
                      borderRadius: '8px',
                      background: 'rgba(13, 17, 26, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#00F5A0')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '4px 0' }}>
              <input
                type="checkbox"
                id="tos-check"
                checked={regAgreeTOS}
                onChange={(e) => setRegAgreeTOS(e.target.checked)}
                style={{ marginTop: '3px', cursor: 'pointer' }}
              />
              <label htmlFor="tos-check" style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.4, cursor: 'pointer' }}>
                I agree to the Terms of Service, Cryptographic Integrity Agreement, and Privacy Policy.
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="hero-primary-btn"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '14px',
                fontSize: '13px',
                marginTop: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.75 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>CREATING ACCOUNT...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>CREATE VERIFIED ACCOUNT</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '14px 0 10px 0' }}>
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
                padding: '12px 16px',
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

            <div style={{ textAlign: 'center', fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', marginTop: '16px' }}>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMessage(null);
                }}
                style={{ background: 'none', border: 'none', color: '#00E5FF', fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                Log In
              </button>
            </div>
            </form>
          )}
        </>
      )}
    </div>

      {/* Subtle Footer Bar */}
      <div
        style={{
          maxWidth: '1240px',
          margin: '32px auto 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          paddingTop: '16px',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: 'var(--f-display)', color: '#FFFFFF', fontWeight: 700 }}>OMNIFACE // 2026</span>
          <span>Multimodal Deepfake Media Verification Engine</span>
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span>Privacy Policy</span>
          <span>Security Whitepaper</span>
          <span>API Specification</span>
        </div>
      </div>
    </footer>
  );
}
