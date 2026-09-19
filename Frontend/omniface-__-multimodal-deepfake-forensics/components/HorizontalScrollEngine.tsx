'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck, Zap } from 'lucide-react';

export const SECTION_IDS = [
  'hero-panel',
  'problem-panel',
  'how-it-works-panel',
  'features-panel',
  'live-demo-panel',
  'trust-tech-panel',
  'use-cases-panel',
  'auth-panel',
];

export const SECTION_NAMES = [
  '01 // Overview',
  '02 // Threat Landscape',
  '03 // Neural Pipeline',
  '04 // Deep Architecture',
  '05 // Live Lab Demo',
  '06 // Benchmarks & Trust',
  '07 // Field Use Cases',
  '08 // Verify & Access',
];

export const globalScrollState = {
  targetScrollX: 0,
  currentScrollX: 0,
  horizontalProgress: 0,
  currentSectionIndex: 0,
  totalSections: SECTION_IDS.length,
  globalProgress: 0,
  globalOpacity: 0,
  isScrolling: false,
};

// Global scroll controller methods
export function scrollToSectionIndex(index: number) {
  if (typeof window === 'undefined') return;
  const vw = window.innerWidth;
  const clampedIndex = Math.max(0, Math.min(SECTION_IDS.length - 1, index));
  globalScrollState.targetScrollX = clampedIndex * vw;
}

export function scrollToSectionId(id: string) {
  const index = SECTION_IDS.indexOf(id);
  if (index !== -1) {
    scrollToSectionIndex(index);
  }
}

export default function HorizontalScrollEngine() {
  const [activeSection, setActiveSection] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const isRunningRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const touchStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    const totalSections = SECTION_IDS.length;
    let maxScrollX = (totalSections - 1) * vw;

    const trackEl = document.getElementById('horizontal-track');
    const sec3El = document.getElementById('how-it-works-panel');
    const sec3Title = sec3El?.querySelector<HTMLElement>('.section-title');
    const sec3Subtitle = sec3El?.querySelector<HTMLElement>('.section-subtitle');
    const sec3Cards = sec3El ? Array.from(sec3El.querySelectorAll<HTMLElement>('.forensic-card, #how-it-works-hud-grid > div')) : [];

    // Hardware acceleration hints
    if (trackEl) trackEl.style.willChange = 'transform';
    if (sec3Title) sec3Title.style.willChange = 'transform, opacity';
    if (sec3Subtitle) sec3Subtitle.style.willChange = 'transform, opacity';
    sec3Cards.forEach((c) => (c.style.willChange = 'transform, opacity'));

    // Resize handler
    const handleResize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      maxScrollX = (totalSections - 1) * vw;
      globalScrollState.targetScrollX = Math.max(0, Math.min(maxScrollX, globalScrollState.currentSectionIndex * vw));
    };
    window.addEventListener('resize', handleResize, { passive: true });

    // 1. Wheel Listener (Converts vertical wheel deltaY & horizontal deltaX into horizontal canvas scroll)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastScrollTimeRef.current = Date.now();
      globalScrollState.isScrolling = true;

      // Handle both standard vertical wheel (deltaY) and horizontal trackpad swipes (deltaX)
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      
      // Speed multiplier for comfortable responsive feel
      const multiplier = e.deltaMode === 1 ? 36 : 1.15;
      const step = delta * multiplier;

      globalScrollState.targetScrollX = Math.max(0, Math.min(maxScrollX, globalScrollState.targetScrollX + step));
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    // 2. Touch Handlers for Mobile / Tablet Swipe Navigation
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const diffX = touchStartRef.current.x - e.touches[0].clientX;
        const diffY = touchStartRef.current.y - e.touches[0].clientY;

        // Use predominant axis delta
        const delta = Math.abs(diffX) > Math.abs(diffY) ? diffX : diffY;

        if (Math.abs(delta) > 4) {
          e.preventDefault();
          lastScrollTimeRef.current = Date.now();
          globalScrollState.isScrolling = true;
          globalScrollState.targetScrollX = Math.max(0, Math.min(maxScrollX, globalScrollState.targetScrollX + delta * 1.5));
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    // 3. Keyboard Navigation (ArrowRight, ArrowLeft, PageDown, PageUp, Home, End)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        const nextIdx = Math.min(totalSections - 1, globalScrollState.currentSectionIndex + 1);
        scrollToSectionIndex(nextIdx);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, globalScrollState.currentSectionIndex - 1);
        scrollToSectionIndex(prevIdx);
      } else if (e.key === 'Home') {
        e.preventDefault();
        scrollToSectionIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        scrollToSectionIndex(totalSections - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // 4. Master RAF Rendering Loop (60fps - 120fps)
    let rafId: number;
    isRunningRef.current = true;
    let lastReportedIndex = -1;

    const tick = () => {
      if (!isRunningRef.current) return;

      // 0.12 lerp factor delivers ultra-smooth catchup without lag
      const diff = globalScrollState.targetScrollX - globalScrollState.currentScrollX;
      if (Math.abs(diff) > 0.1) {
        globalScrollState.currentScrollX += diff * 0.12;
      } else {
        globalScrollState.currentScrollX = globalScrollState.targetScrollX;
        globalScrollState.isScrolling = false;
      }

      const currX = globalScrollState.currentScrollX;
      const progress = maxScrollX > 0 ? currX / maxScrollX : 0;
      globalScrollState.horizontalProgress = progress;

      // Current section index calculation
      const activeIdx = Math.min(totalSections - 1, Math.max(0, Math.round(currX / vw)));
      globalScrollState.currentSectionIndex = activeIdx;

      // -----------------------------------------------------------------
      // A. APPLY HARDWARE TRANSFORM TO HORIZONTAL TRACK
      // -----------------------------------------------------------------
      if (trackEl) {
        trackEl.style.transform = `translate3d(-${currX.toFixed(1)}px, 0, 0)`;
      }

      // -----------------------------------------------------------------
      // B. GLOBAL ROBOTIC FACE PROGRESS (Activated from Section 3 onwards)
      // -----------------------------------------------------------------
      // Section 1 (0vw): opacity 0
      // Section 2 (1vw): opacity 0 -> 0.35
      // Section 3 (2vw): opacity 1.0 (fully active)
      // Section 3 to Section 8 (2vw -> 7vw): progress 0.0 -> 1.0 (240 frames)
      const sec3StartX = 1.0 * vw;
      const sec3FullX = 2.0 * vw;
      const scrubStartX = 2.0 * vw;
      const scrubEndX = (totalSections - 1) * vw;

      if (currX < sec3StartX) {
        globalScrollState.globalOpacity = 0;
        globalScrollState.globalProgress = 0;
      } else if (currX < sec3FullX) {
        const inP = (currX - sec3StartX) / (sec3FullX - sec3StartX);
        globalScrollState.globalOpacity = inP;
        globalScrollState.globalProgress = 0;
      } else {
        globalScrollState.globalOpacity = 1.0;
        const scrubDist = Math.max(1, scrubEndX - scrubStartX);
        const p = Math.max(0, Math.min(1, (currX - scrubStartX) / scrubDist));
        globalScrollState.globalProgress = p;
      }

      // -----------------------------------------------------------------
      // C. SPECIAL VERTICAL ENTRANCE FOR SECTION 3 INTERNAL CONTENT
      // -----------------------------------------------------------------
      // When scrolling from Section 2 to Section 3:
      // Content enters vertically (translateY 50px -> 0, opacity 0 -> 1)
      const sec3EntranceProgress = Math.max(0, Math.min(1, (currX - 1.0 * vw) / vw));

      if (sec3Title) {
        const titleY = (1 - sec3EntranceProgress) * 44;
        sec3Title.style.transform = `translate3d(0, ${titleY.toFixed(1)}px, 0)`;
        sec3Title.style.opacity = Math.max(0, Math.min(1, sec3EntranceProgress * 1.2)).toFixed(3);
      }

      if (sec3Subtitle) {
        const subInP = Math.max(0, Math.min(1, (sec3EntranceProgress - 0.1) / 0.9));
        const subY = (1 - subInP) * 32;
        sec3Subtitle.style.transform = `translate3d(0, ${subY.toFixed(1)}px, 0)`;
        sec3Subtitle.style.opacity = subInP.toFixed(3);
      }

      for (let c = 0; c < sec3Cards.length; c++) {
        const card = sec3Cards[c];
        const cardInP = Math.max(0, Math.min(1, (sec3EntranceProgress - 0.15 - c * 0.05) / 0.8));
        const cardY = (1 - cardInP) * 36;
        card.style.transform = `translate3d(0, ${cardY.toFixed(1)}px, 0)`;
        card.style.opacity = cardInP.toFixed(3);
      }

      // Update UI state at throttled threshold
      if (activeIdx !== lastReportedIndex) {
        lastReportedIndex = activeIdx;
        setActiveSection(activeIdx);
      }
      setScrollPercent(Math.round(progress * 100));

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      {/* 
        =============================================================================
        FLOATING HORIZONTAL PROGRESS BAR & NAVIGATION CONTROLS (BOTTOM HUD)
        =============================================================================
      */}
      <div
        id="horizontal-navigation-hud"
        style={{
          position: 'fixed',
          bottom: 'clamp(14px, 2.5vh, 24px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          backgroundColor: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '100px',
          padding: '8px 18px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 229, 255, 0.15)',
          pointerEvents: 'auto',
        }}
      >
        {/* Previous Button */}
        <button
          type="button"
          id="nav-prev-section-btn"
          onClick={() => scrollToSectionIndex(activeSection - 1)}
          disabled={activeSection === 0}
          title="Previous Section (ArrowLeft)"
          style={{
            background: 'none',
            border: 'none',
            color: activeSection === 0 ? 'rgba(255, 255, 255, 0.2)' : '#00E5FF',
            cursor: activeSection === 0 ? 'not-allowed' : 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <ChevronLeft size={18} />
        </button>

        {/* Section Counter & Current Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontFamily: 'var(--f-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#00E5FF',
            whiteSpace: 'nowrap',
          }}>
            {SECTION_NAMES[activeSection]}
          </span>

          <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontSize: '11px' }}>|</span>

          {/* Section Indicator Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {SECTION_IDS.map((id, idx) => {
              const isActive = activeSection === idx;
              return (
                <button
                  key={id}
                  type="button"
                  id={`hud-dot-${idx}`}
                  onClick={() => scrollToSectionIndex(idx)}
                  title={`Jump to ${SECTION_NAMES[idx]}`}
                  style={{
                    width: isActive ? '20px' : '6px',
                    height: '6px',
                    borderRadius: '100px',
                    backgroundColor: isActive ? '#00E5FF' : 'rgba(255, 255, 255, 0.25)',
                    boxShadow: isActive ? '0 0 10px #00E5FF' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Next Button */}
        <button
          type="button"
          id="nav-next-section-btn"
          onClick={() => scrollToSectionIndex(activeSection + 1)}
          disabled={activeSection === SECTION_IDS.length - 1}
          title="Next Section (ArrowRight / Scroll Down)"
          style={{
            background: 'none',
            border: 'none',
            color: activeSection === SECTION_IDS.length - 1 ? 'rgba(255, 255, 255, 0.2)' : '#00E5FF',
            cursor: activeSection === SECTION_IDS.length - 1 ? 'not-allowed' : 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Thin Glowing Top Scroll Line */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '2.5px',
        zIndex: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        pointerEvents: 'none',
      }}>
        <div style={{
          width: `${scrollPercent}%`,
          height: '100%',
          backgroundColor: '#00E5FF',
          boxShadow: '0 0 12px #00E5FF, 0 0 4px #00E5FF',
          transition: 'width 0.1s linear',
        }} />
      </div>
    </>
  );
}
