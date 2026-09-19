'use client';

import { ShieldCheck } from 'lucide-react';

interface HeroNavProps {
  onScrollTo?: (id: string) => void;
}

export default function HeroNav({ onScrollTo }: HeroNavProps) {
  const handleScroll = (id: string) => {
    if (onScrollTo) {
      onScrollTo(id);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav
      className="interactive"
      id="hero-nav"
      style={{
        position: 'absolute',
        top: 'clamp(10px, 2vh, 24px)',
        left: 'clamp(16px, 3vw, 42px)',
        right: 'clamp(16px, 3vw, 42px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        pointerEvents: 'auto',
      }}
    >
      {/* Brand Badge */}
      <div
        id="brand-badge"
        onClick={() => handleScroll('cyber-ronin-hero')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#0A0A0A',
          border: '1px solid #262626',
          borderRadius: '100px',
          padding: '6px 16px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--f-display)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#FFFFFF',
          }}
        >
          OMNIFACE <span style={{ color: '#888888' }}>{'//'}</span> FORENSICS
        </span>
      </div>

      {/* Navigation Links */}
      <div
        id="nav-links-container"
        style={{
          display: 'none',
          alignItems: 'center',
          gap: '6px',
          background: '#0A0A0A',
          border: '1px solid #262626',
          borderRadius: '100px',
          padding: '4px 8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        }}
        className="lg:!flex"
      >
        {[
          { id: 'problem-section', label: 'Problem' },
          { id: 'how-it-works-section', label: 'Pipeline' },
          { id: 'features-section', label: 'Features' },
          { id: 'live-demo-section', label: 'Live Demo' },
          { id: 'trust-tech-section', label: 'Trust / Tech' },
          { id: 'use-cases-section', label: 'Use Cases' },
          { id: 'auth-section', label: 'Verify' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            id={`nav-link-${item.id}`}
            onClick={() => handleScroll(item.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 14px',
              fontSize: '11px',
              fontFamily: 'var(--f-display)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.75)',
              cursor: 'pointer',
              borderRadius: '100px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)';
              e.currentTarget.style.background = 'none';
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Action Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          id="hero-auth-direct-btn"
          onClick={() => handleScroll('auth-section')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#FFFFFF',
            color: '#0A0A0A',
            border: '1px solid #0A0A0A',
            borderRadius: '100px',
            padding: '7px 14px',
            fontFamily: 'var(--f-display)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F0F0F0';
            e.currentTarget.style.borderColor = '#000000';
            e.currentTarget.style.color = '#000000';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = '#0A0A0A';
            e.currentTarget.style.color = '#0A0A0A';
          }}
        >
          <span>Log In</span>
        </button>

        <button
          type="button"
          id="hero-cta-demo-btn"
          onClick={() => handleScroll('live-demo-section')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#0A0A0A',
            color: '#FFFFFF',
            border: '1px solid #0A0A0A',
            borderRadius: '100px',
            padding: '8px 18px',
            fontFamily: 'var(--f-display)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.background = '#262626';
            e.currentTarget.style.borderColor = '#262626';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.background = '#0A0A0A';
            e.currentTarget.style.borderColor = '#0A0A0A';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.25)';
          }}
        >
          <ShieldCheck size={14} color="#FFFFFF" />
          <span>Launch Lab</span>
        </button>
      </div>
    </nav>
  );
}
