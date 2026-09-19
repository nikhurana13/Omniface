'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MailCheck, ArrowRight, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authService } from '@/lib/api/auth';

interface VerificationScreenProps {
  email: string;
  onLoginClick?: () => void;
  loginHref?: string;
  allowResend?: boolean;
}

export default function VerificationScreen({
  email,
  onLoginClick,
  loginHref = '/login',
  allowResend = false,
}: VerificationScreenProps) {
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setResendStatus(null);
    try {
      const res = await authService.resendVerificationEmail(email);
      if (res.success) {
        setResendStatus({
          type: 'success',
          message: 'A fresh verification email has been dispatched to your inbox.',
        });
      } else {
        setResendStatus({
          type: 'error',
          message: res.error || 'Failed to resend verification email. Please try again later.',
        });
      }
    } catch {
      setResendStatus({
        type: 'error',
        message: 'An unexpected error occurred while resending verification.',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '8px 0',
      }}
    >
      {/* Icon Badge */}
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          border: '1px solid rgba(0, 229, 255, 0.4)',
          boxShadow: '0 0 25px rgba(0, 229, 255, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto',
          color: '#00E5FF',
        }}
      >
        <MailCheck size={32} />
      </div>

      {/* Heading */}
      <h2
        style={{
          fontFamily: 'var(--f-display)',
          fontSize: '20px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          color: '#FFFFFF',
          marginBottom: '14px',
          textTransform: 'uppercase',
        }}
      >
        Email Verification Required
      </h2>

      {/* Exact required message */}
      <div
        style={{
          backgroundColor: 'rgba(0, 229, 255, 0.05)',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--f-sans)',
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'rgba(255, 255, 255, 0.9)',
            margin: 0,
          }}
        >
          We have sent you a verification email to{' '}
          <strong style={{ color: '#00E5FF', wordBreak: 'break-all' }}>{email}</strong>.
          <br />
          Please verify it and log in.
        </p>
      </div>

      {/* Resend status alert */}
      {resendStatus && (
        <div
          style={{
            backgroundColor:
              resendStatus.type === 'success'
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${
              resendStatus.type === 'success'
                ? 'rgba(16, 185, 129, 0.35)'
                : 'rgba(239, 68, 68, 0.35)'
            }`,
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: resendStatus.type === 'success' ? '#34D399' : '#F87171',
            fontSize: '12.5px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          {resendStatus.type === 'success' ? (
            <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
          ) : (
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
          )}
          <span>{resendStatus.message}</span>
        </div>
      )}

      {/* Action: Log In Button */}
      {onLoginClick ? (
        <button
          type="button"
          onClick={onLoginClick}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: '#00E5FF',
            border: 'none',
            color: '#06080D',
            fontFamily: 'var(--f-display)',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 0 20px rgba(0, 229, 255, 0.35)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <span>LOG IN</span>
          <ArrowRight size={15} />
        </button>
      ) : (
        <Link
          href={loginHref}
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: '8px',
            backgroundColor: '#00E5FF',
            border: 'none',
            color: '#06080D',
            fontFamily: 'var(--f-display)',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 0 20px rgba(0, 229, 255, 0.35)',
            textDecoration: 'none',
          }}
        >
          <span>LOG IN</span>
          <ArrowRight size={15} />
        </Link>
      )}

      {/* Secondary Resend Option (pure Firebase Auth) */}
      {allowResend && (
        <div style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)' }}>
          Didn&apos;t receive the email?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            style={{
              background: 'none',
              border: 'none',
              color: '#00E5FF',
              fontWeight: 600,
              cursor: isResending ? 'not-allowed' : 'pointer',
              padding: 0,
              textDecoration: 'underline',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isResending ? (
              <>
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Sending...</span>
              </>
            ) : (
              'Resend Verification Email'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
