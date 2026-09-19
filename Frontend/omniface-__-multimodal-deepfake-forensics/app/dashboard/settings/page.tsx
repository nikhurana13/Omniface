'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Mail, 
  Lock, 
  Bell, 
  Moon, 
  ShieldCheck, 
  LogOut, 
  CheckCircle2, 
  Key,
  Cpu
} from 'lucide-react';
import { authService, UserProfile } from '@/lib/api/auth';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  
  // Settings Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [darkTheme, setDarkTheme] = useState(true);
  const [apiKey, setApiKey] = useState('omni_live_948f102ba9842c98e1a');
  
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const u = authService.getCurrentUser();
    if (u) {
      setUser(u);
      setName(u.name || '');
      setEmail(u.email || '');
    }
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      const updated = { ...user, name, email };
      localStorage.setItem('omniface_auth_user', JSON.stringify(updated));
      setUser(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    router.replace('/');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Header */}
      <div>
        <h1 style={{
          fontFamily: 'var(--f-display)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: '#FFFFFF',
          marginBottom: '6px',
        }}>
          Account &amp; Engine Settings
        </h1>
        <p style={{
          fontFamily: 'var(--f-sans)',
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.65)',
        }}>
          Manage your forensic investigator credentials, API access keys, and detection preferences.
        </p>
      </div>

      {savedSuccess && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#34D399',
          fontSize: '13.5px',
        }}>
          <CheckCircle2 size={18} />
          <span>Preferences updated successfully.</span>
        </div>
      )}

      {/* 1. Profile Information */}
      <div style={{
        backgroundColor: 'rgba(13, 17, 26, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '14px' }}>
          <User size={18} color="#00E5FF" />
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
            Profile &amp; Identity
          </h2>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#FFFFFF',
                fontFamily: 'var(--f-sans)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#FFFFFF',
                fontFamily: 'var(--f-sans)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="submit"
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                backgroundColor: '#00E5FF',
                border: 'none',
                color: '#06080D',
                fontFamily: 'var(--f-display)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Save Profile
            </button>
          </div>
        </form>
      </div>

      {/* 2. Security & Password */}
      <div style={{
        backgroundColor: 'rgba(13, 17, 26, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '14px' }}>
          <Lock size={18} color="#00E5FF" />
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
            Security &amp; Password
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
              Current Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#FFFFFF',
                fontFamily: 'var(--f-sans)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
              New Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#FFFFFF',
                fontFamily: 'var(--f-sans)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. API Keys & Preferences */}
      <div style={{
        backgroundColor: 'rgba(13, 17, 26, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '14px' }}>
          <Key size={18} color="#00E5FF" />
          <h2 style={{ fontFamily: 'var(--f-display)', fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
            API Access &amp; Detection Preferences
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--f-display)', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', marginBottom: '6px' }}>
              Secret API Key
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                readOnly
                value={apiKey}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#00E5FF',
                  fontFamily: 'var(--f-mono)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  alert('API Key copied to clipboard!');
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--f-display)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Copy Key
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bell size={16} color="rgba(255, 255, 255, 0.6)" />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#FFFFFF' }}>Deepfake Alert Notifications</div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>Receive instant email alerts when anomalous media exceeds 90% threshold</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#00E5FF', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Moon size={16} color="rgba(255, 255, 255, 0.6)" />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#FFFFFF' }}>Dark Futuristic Theme</div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>Optimized OLED dark aesthetics for high-contrast forensic inspection</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={darkTheme}
              onChange={(e) => setDarkTheme(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#00E5FF', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* 4. Logout Action */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '16px',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '14px', fontWeight: 700, color: '#EF4444' }}>
            Sign Out of OmniFace
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
            Terminate secure forensic session and return to the public portal.
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '8px',
            backgroundColor: '#EF4444',
            border: 'none',
            color: '#FFFFFF',
            fontFamily: 'var(--f-display)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <LogOut size={14} />
          <span>LOG OUT</span>
        </button>
      </div>

    </div>
  );
}
