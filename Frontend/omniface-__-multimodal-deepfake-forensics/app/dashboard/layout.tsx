'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  ShieldCheck, 
  Layers, 
  History, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Activity,
  Cpu,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { authService, User } from '@/lib/api/auth';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Authenticate user session with Firebase Auth lifecycle listener
  useEffect(() => {
    // Initial check from local session cache for instant hydration
    const initialUser = authService.getCurrentUser();
    if (initialUser) {
      setUser(initialUser);
      setIsLoadingAuth(false);
    }

    // Subscribe to real-time Firebase Auth state changes
    const unsubscribe = authService.onAuthStateChange((authUser) => {
      if (!authUser) {
        setUser(null);
        router.replace('/login');
      } else {
        setUser(authUser);
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await authService.logout();
    router.push('/');
  };

  const navItems = [
    { href: '/dashboard', label: 'New Analysis', icon: Layers, exact: true },
    { href: '/dashboard/history', label: 'History', icon: History },
    { href: '/dashboard/reports', label: 'Reports', icon: FileText },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];

  if (isLoadingAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#06080D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#00E5FF',
        fontFamily: 'var(--f-mono)',
        fontSize: '13px',
        letterSpacing: '0.08em',
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            border: '2px solid rgba(0, 229, 255, 0.2)',
            borderTopColor: '#00E5FF',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span>AUTHENTICATING SECURE SESSION...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      backgroundColor: '#06080D',
      color: '#F0F4F8',
      display: 'flex',
      overflowX: 'hidden',
    }}>
      {/* 
        =============================================================================
        SECTION 2 BACKGROUND FLUID MP4 VIDEO (User Request: "FOR NOW USE THE SAME ANIMATION THATS IS IN THE SECOND SECTION BEHIND THE DASHBOARD")
        =============================================================================
      */}
      <div
        id="dashboard-fluid-bg-container"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          id="dashboard-bg-video"
          src="/assets/section2-bg.mp4"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.32,
            filter: 'brightness(0.65) contrast(1.15) saturate(1.2)',
          }}
        />
        {/* Dark radial and noise scrim to guarantee high contrast UI readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 60% 30%, rgba(6, 8, 13, 0.72) 0%, rgba(6, 8, 13, 0.94) 85%, #06080D 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(0, 229, 255, 0.05) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            opacity: 0.6,
          }}
        />
      </div>

      {/* 
        =============================================================================
        SIDEBAR NAVIGATION (DESKTOP)
        =============================================================================
      */}
      <aside
        id="dashboard-sidebar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '260px',
          backgroundColor: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 16px',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.5)',
        }}
        className="hidden md:!flex"
      >
        {/* Top: Logo & Brand */}
        <div>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              marginBottom: '28px',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 229, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00E5FF',
            }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--f-display)',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#FFFFFF',
                lineHeight: 1.1,
              }}>
                OMNIFACE
              </div>
              <div style={{
                fontFamily: 'var(--f-mono)',
                fontSize: '9px',
                color: '#00E5FF',
                letterSpacing: '0.06em',
              }}>
                DEEPFAKE FORENSICS
              </div>
            </div>
          </Link>

          {/* Navigation Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{
              fontFamily: 'var(--f-mono)',
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.4)',
              letterSpacing: '0.1em',
              padding: '0 12px 6px',
              textTransform: 'uppercase',
            }}>
              Workspace
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact 
                ? pathname === item.href 
                : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontFamily: 'var(--f-display)',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '0.02em',
                    color: isActive ? '#00E5FF' : 'rgba(255, 255, 255, 0.72)',
                    backgroundColor: isActive ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    border: isActive ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid transparent',
                    boxShadow: isActive ? '0 0 12px rgba(0, 229, 255, 0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.color = '#FFFFFF';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.72)';
                    }
                  }}
                >
                  <Icon size={16} color={isActive ? '#00E5FF' : 'currentColor'} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Bottom: User Profile & Logout */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          {/* Engine Status Widget */}
          <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(0, 229, 255, 0.04)',
            border: '1px solid rgba(0, 229, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981',
              }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: '#A0AEC0' }}>
                Neural Engine
              </span>
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: '#10B981', fontWeight: 600 }}>
              ONLINE
            </span>
          </div>

          {/* User Profile Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00E5FF',
                fontFamily: 'var(--f-display)',
                fontWeight: 700,
                fontSize: '12px',
                flexShrink: 0,
              }}>
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--f-display)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {user?.name || 'Analyst'}
                </div>
                <div style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.45)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {user?.email || 'analyst@omniface.ai'}
                </div>
              </div>
            </div>

            {/* Logout button */}
            <button
              type="button"
              id="sidebar-logout-btn"
              onClick={handleLogout}
              title="Log out"
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                borderRadius: '6px',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#EF4444';
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* 
        =============================================================================
        MOBILE NAVIGATION HEADER & DRAWER
        =============================================================================
      */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          backgroundColor: 'rgba(10, 14, 23, 0.94)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
        className="md:!hidden"
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <ShieldCheck size={20} color="#00E5FF" />
          <span style={{ fontFamily: 'var(--f-display)', fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
            OMNIFACE
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            padding: '8px',
          }}
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            top: '60px',
            backgroundColor: 'rgba(6, 8, 13, 0.96)',
            backdropFilter: 'blur(24px)',
            zIndex: 49,
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
          className="md:!hidden"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontFamily: 'var(--f-display)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: isActive ? '#00E5FF' : '#FFFFFF',
                    backgroundColor: isActive ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                    border: isActive ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <Icon size={20} color={isActive ? '#00E5FF' : 'currentColor'} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00E5FF',
                fontWeight: 700,
              }}>
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '14px' }}>{user?.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>{user?.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#EF4444',
                fontFamily: 'var(--f-display)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* 
        =============================================================================
        MAIN CONTENT AREA
        =============================================================================
      */}
      <div style={{
        flex: 1,
        marginLeft: 0,
        position: 'relative',
        zIndex: 10,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
      className="md:!ml-[260px]"
      >
        {/* Top bar (Desktop) */}
        <header
          style={{
            height: '64px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(10, 14, 23, 0.72)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
          className="hidden md:!flex"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontSize: '14px', fontWeight: 700, letterSpacing: '0.04em', color: '#FFFFFF' }}>
              Deepfake Analysis
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '12px' }}>/</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#00E5FF', letterSpacing: '0.05em' }}>
              {pathname === '/dashboard' || pathname === '/dashboard/analyze' ? 'ANALYZE MEDIA' : pathname.replace('/dashboard/', '').toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link
              href="/"
              target="_blank"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--f-display)',
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.6)',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#00E5FF';
                e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <span>Landing Page</span>
              <ExternalLink size={12} />
            </Link>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px',
              borderRadius: '100px',
              backgroundColor: 'rgba(0, 229, 255, 0.08)',
              border: '1px solid rgba(0, 229, 255, 0.25)',
            }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#00E5FF',
                boxShadow: '0 0 6px #00E5FF',
              }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#FFFFFF', fontWeight: 600 }}>
                {user?.name || 'Analyst'}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main style={{
          flex: 1,
          padding: 'clamp(20px, 3vw, 40px)',
          marginTop: '60px',
        }}
        className="md:!mt-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
