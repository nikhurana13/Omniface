'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Play, Cpu, ShieldCheck, Activity, Layers, Maximize2 } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import HeroNav from '@/components/HeroNav';
import ProblemSection from '@/components/ProblemSection';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const RADIUS_OPTIONS = [140, 260, 380];
const RADIUS_LABELS = ['Compact (140px)', 'Standard (260px)', 'Wide (380px)'];

interface HeroProblemSequenceProps {
  onScrollTo: (id: string) => void;
}

export default function HeroProblemSequence({ onScrollTo }: HeroProblemSequenceProps) {
  const [isSwapped, setIsSwapped] = useState(false);
  const [lensRadiusIndex, setLensRadiusIndex] = useState(1);
  const radiusIndexRef = useRef(lensRadiusIndex);
  useEffect(() => {
    radiusIndexRef.current = lensRadiusIndex;
  }, [lensRadiusIndex]);

  const sequenceContainerRef = useRef<HTMLDivElement>(null);
  const pinnedStageRef = useRef<HTMLDivElement>(null);
  const heroLayerRef = useRef<HTMLDivElement>(null);
  const problemLayerRef = useRef<HTMLDivElement>(null);

  // 1. Interactive spotlight hover reveal on hero operative images
  useEffect(() => {
    const heroEl = document.getElementById('cyber-ronin-hero');
    const revealImg = document.getElementById('reveal-img');
    if (!heroEl || !revealImg) return;

    const updateSpotlight = (clientX: number, clientY: number) => {
      const rect = revealImg.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const w = window.innerWidth;
      const baseR = RADIUS_OPTIONS[radiusIndexRef.current] ?? 260;
      let scale = 1;
      if (w < 480) {
        scale = 0.55;
      } else if (w < 768) {
        scale = 0.75;
      } else if (w < 1200) {
        scale = 0.9;
      }
      const r = Math.round(baseR * scale);
      const gradient = `radial-gradient(circle ${r}px at ${x}px ${y}px, #fff 0%, #fff 40%, rgba(255,255,255,0.78) 60%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0.12) 88%, transparent 100%)`;
      revealImg.style.webkitMaskImage = gradient;
      revealImg.style.maskImage = gradient;
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateSpotlight(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        updateSpotlight(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleMouseLeave = () => {
      const gradient = 'radial-gradient(circle 0px at -999px -999px, #fff 0%, transparent 100%)';
      revealImg.style.webkitMaskImage = gradient;
      revealImg.style.maskImage = gradient;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    heroEl.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      heroEl.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // 2. Master Measurable Pinned Scroll Sequence (Hero -> Black -> Problem Background -> Content -> Full)
  useEffect(() => {
    const container = sequenceContainerRef.current;
    const heroLayer = heroLayerRef.current;
    const problemLayer = problemLayerRef.current;
    if (!container || !heroLayer || !problemLayer) return;

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      if (prefersReducedMotion) {
        // Fallback for reduced motion
        gsap.set(heroLayer, { opacity: 1, y: 0, pointerEvents: 'auto' });
        gsap.set(problemLayer, { opacity: 1, y: 0, pointerEvents: 'auto' });
        return;
      }

      // Initial explicit starting properties
      gsap.set(heroLayer, { opacity: 1, y: 0, pointerEvents: 'auto' });
      gsap.set(problemLayer, { opacity: 0, pointerEvents: 'none' });

      // Target background and content sub-elements in ProblemSection
      const problemVideoLayer = problemLayer.querySelector('.section-problem-video-layer') as HTMLElement | null;
      const problemScrim = problemLayer.querySelector('.section-problem-scrim') as HTMLElement | null;
      const problemBadge = problemLayer.querySelector('#problem-badge') as HTMLElement | null;
      const problemTitle = problemLayer.querySelector('#problem-title') as HTMLElement | null;
      const problemSubtitle = problemLayer.querySelector('#problem-subtitle') as HTMLElement | null;
      const problemCards = Array.from(problemLayer.querySelectorAll('#problem-vectors-grid > article')) as HTMLElement[];
      const problemBanner = problemLayer.querySelector('#problem-stats-banner') as HTMLElement | null;

      if (problemVideoLayer) gsap.set(problemVideoLayer, { opacity: 0, scale: 1.05 });
      if (problemScrim) gsap.set(problemScrim, { opacity: 0 });
      if (problemBadge) gsap.set(problemBadge, { opacity: 0, y: 35 });
      if (problemTitle) gsap.set(problemTitle, { opacity: 0, y: 55, filter: 'blur(8px)' });
      if (problemSubtitle) gsap.set(problemSubtitle, { opacity: 0, y: 35 });
      if (problemCards.length > 0) gsap.set(problemCards, { opacity: 0, y: 45 });
      if (problemBanner) gsap.set(problemBanner, { opacity: 0, y: 40 });

      // Master Pinned ScrollTrigger with 250vh scroll distance
      ScrollTrigger.create({
        trigger: container,
        start: 'top top',
        end: '+=250vh',
        pin: true,
        anticipatePin: 1,
        scrub: 0.5,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const p = Math.max(0, Math.min(1, self.progress));

          // =========================================================================
          // PHASE 1: 0% – 20% -> HERO EXIT
          // =========================================================================
          if (p <= 0.20) {
            const norm = p / 0.20; // 0 -> 1
            const heroOpacity = 1 - norm; // 1 -> 0
            const heroY = -norm * 40; // 0 -> -40px

            gsap.set(heroLayer, {
              opacity: heroOpacity,
              y: heroY,
              pointerEvents: heroOpacity > 0.3 ? 'auto' : 'none',
              visibility: 'visible',
            });

            gsap.set(problemLayer, {
              opacity: 0,
              pointerEvents: 'none',
              visibility: 'hidden',
            });
            if (problemVideoLayer) gsap.set(problemVideoLayer, { opacity: 0, scale: 1.05 });
            if (problemScrim) gsap.set(problemScrim, { opacity: 0 });
          }

          // =========================================================================
          // PHASE 2: 20% – 35% -> BLACK TRANSITION
          // =========================================================================
          else if (p > 0.20 && p <= 0.35) {
            gsap.set(heroLayer, {
              opacity: 0,
              y: -40,
              pointerEvents: 'none',
              visibility: 'hidden',
            });

            gsap.set(problemLayer, {
              opacity: 0,
              pointerEvents: 'none',
              visibility: 'hidden',
            });
            if (problemVideoLayer) gsap.set(problemVideoLayer, { opacity: 0, scale: 1.05 });
            if (problemScrim) gsap.set(problemScrim, { opacity: 0 });
          }

          // =========================================================================
          // PHASE 3: 35% – 60% -> PROBLEM BACKGROUND REVEAL
          // =========================================================================
          else if (p > 0.35 && p <= 0.60) {
            const norm = (p - 0.35) / 0.25; // 0 -> 1
            const bgOpacity = norm; // 0 -> 1
            const bgScale = 1.05 - norm * 0.05; // 1.05 -> 1.00

            gsap.set(heroLayer, {
              opacity: 0,
              pointerEvents: 'none',
              visibility: 'hidden',
            });

            gsap.set(problemLayer, {
              opacity: 1,
              pointerEvents: 'none',
              visibility: 'visible',
            });

            if (problemVideoLayer) gsap.set(problemVideoLayer, { opacity: bgOpacity, scale: bgScale });
            if (problemScrim) gsap.set(problemScrim, { opacity: bgOpacity });

            // Foreground content stays hidden in this phase
            if (problemBadge) gsap.set(problemBadge, { opacity: 0, y: 35 });
            if (problemTitle) gsap.set(problemTitle, { opacity: 0, y: 55, filter: 'blur(8px)' });
            if (problemSubtitle) gsap.set(problemSubtitle, { opacity: 0, y: 35 });
            if (problemCards.length > 0) gsap.set(problemCards, { opacity: 0, y: 45 });
            if (problemBanner) gsap.set(problemBanner, { opacity: 0, y: 40 });
          }

          // =========================================================================
          // PHASE 4: 60% – 80% -> CONTENT REVEAL
          // =========================================================================
          else if (p > 0.60 && p <= 0.80) {
            const norm = (p - 0.60) / 0.20; // 0 -> 1

            gsap.set(heroLayer, {
              opacity: 0,
              pointerEvents: 'none',
              visibility: 'hidden',
            });

            gsap.set(problemLayer, {
              opacity: 1,
              pointerEvents: norm > 0.8 ? 'auto' : 'none',
              visibility: 'visible',
            });

            if (problemVideoLayer) gsap.set(problemVideoLayer, { opacity: 1, scale: 1.0 });
            if (problemScrim) gsap.set(problemScrim, { opacity: 1 });

            // Sequential Staggered Content Reveal
            // 1. Badge: starts at norm=0.0 -> 0.4
            const badgeNorm = Math.min(1, norm / 0.4);
            if (problemBadge) gsap.set(problemBadge, { opacity: badgeNorm, y: (1 - badgeNorm) * 30 });

            // 2. Title: starts at norm=0.15 -> 0.65
            const titleNorm = Math.max(0, Math.min(1, (norm - 0.15) / 0.5));
            if (problemTitle) {
              gsap.set(problemTitle, {
                opacity: titleNorm,
                y: (1 - titleNorm) * 45,
                filter: `blur(${(1 - titleNorm) * 8}px)`,
              });
            }

            // 3. Subtitle: starts at norm=0.3 -> 0.75
            const subNorm = Math.max(0, Math.min(1, (norm - 0.3) / 0.45));
            if (problemSubtitle) gsap.set(problemSubtitle, { opacity: subNorm, y: (1 - subNorm) * 30 });

            // 4. Cards: starts at norm=0.45 -> 0.95
            const cardsNorm = Math.max(0, Math.min(1, (norm - 0.45) / 0.5));
            problemCards.forEach((card, idx) => {
              const cardOffset = idx * 0.1;
              const cNorm = Math.max(0, Math.min(1, (cardsNorm - cardOffset) / (1 - cardOffset)));
              gsap.set(card, { opacity: cNorm, y: (1 - cNorm) * 40 });
            });

            // 5. Banner: starts at norm=0.55 -> 1.0
            const bannerNorm = Math.max(0, Math.min(1, (norm - 0.55) / 0.45));
            if (problemBanner) gsap.set(problemBanner, { opacity: bannerNorm, y: (1 - bannerNorm) * 35 });
          }

          // =========================================================================
          // PHASE 5: 80% – 100% -> FULL PROBLEM STATE
          // =========================================================================
          else if (p > 0.80) {
            gsap.set(heroLayer, {
              opacity: 0,
              pointerEvents: 'none',
              visibility: 'hidden',
            });

            gsap.set(problemLayer, {
              opacity: 1,
              pointerEvents: 'auto',
              visibility: 'visible',
            });

            if (problemVideoLayer) gsap.set(problemVideoLayer, { opacity: 1, scale: 1.0 });
            if (problemScrim) gsap.set(problemScrim, { opacity: 1 });
            if (problemBadge) gsap.set(problemBadge, { opacity: 1, y: 0 });
            if (problemTitle) gsap.set(problemTitle, { opacity: 1, y: 0, filter: 'blur(0px)' });
            if (problemSubtitle) gsap.set(problemSubtitle, { opacity: 1, y: 0 });
            if (problemCards.length > 0) gsap.set(problemCards, { opacity: 1, y: 0 });
            if (problemBanner) gsap.set(problemBanner, { opacity: 1, y: 0 });
          }
        },
      });
    }, sequenceContainerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={sequenceContainerRef}
      id="hero-problem-sequence-container"
      style={{
        position: 'relative',
        width: '100%',
        backgroundColor: '#000000',
      }}
    >
      {/* Pinned 100vh Stage Container */}
      <div
        ref={pinnedStageRef}
        id="hero-problem-pinned-stage"
        style={{
          position: 'relative',
          width: '100%',
          height: '100dvh',
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}
      >
        {/* =========================================================================
            STAGE LAYER 1: HERO SECTION
            ========================================================================= */}
        <div
          ref={heroLayerRef}
          id="hero-stage-layer"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 10,
            willChange: 'transform, opacity',
          }}
        >
          <section className="hero" id="cyber-ronin-hero">
            {/* Top Floating Navigation */}
            <HeroNav onScrollTo={onScrollTo} />

            {/* Background & Lighting */}
            <div className="hero-bg" id="hero-bg" />
            <div className="cyber-texture" id="cyber-texture" />
            <div className="geometric-accent" id="geometric-accent" />

            {/* Base Operative Image */}
            <div
              className="hero-base-img"
              id="hero-base-img"
              style={{
                backgroundImage: `url('${isSwapped ? '/hero-reveal.png' : '/hero-base.png'}')`,
              }}
              aria-hidden="true"
            />

            {/* Interactive Hover Reveal Image */}
            <div
              className="hero-reveal-img"
              id="reveal-img"
              style={{
                backgroundImage: `url('${isSwapped ? '/hero-base.png' : '/hero-reveal.png'}')`,
              }}
              aria-hidden="true"
            />

            {/* Hero Content Layer */}
            <div className="hero-ui" id="hero-ui">
              <div className="hero-left" id="hero-left">
                <div className="hero-copy interactive" id="hero-copy">
                  <h1 className="words-pull-up" id="hero-title">
                    <span className="pull-line">OMNIFACE //</span>
                    <span className="pull-line">DEEPFAKE FORENSICS</span>
                  </h1>
                  <p className="fade-up-reveal" data-delay="0.5" id="hero-desc">
                    Automated multimodal media verification engine. Research-grade synthetic manipulation, physiological rPPG pulse analysis, and boundary tampering detection in real time.
                  </p>

                  {/* Forensic Layer & Lens Radius Controls */}
                  <div className="icon-row fade-up-reveal" data-delay="0.6" id="hero-controls-row">
                    <button
                      className="icon-btn"
                      type="button"
                      id="btn-switch-image"
                      aria-label="Switch Forensic Layer"
                      title="Switch Image Layer (Base / Reveal)"
                      onClick={() => setIsSwapped((prev) => !prev)}
                    >
                      <Layers size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      id="btn-resize-blur"
                      aria-label={`Lens Radius: ${RADIUS_LABELS[lensRadiusIndex]}`}
                      title={`Lens Circle Radius: ${RADIUS_LABELS[lensRadiusIndex]} (Click to cycle)`}
                      onClick={() => setLensRadiusIndex((prev) => (prev + 1) % 3)}
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>

                  <div className="hero-actions-row fade-up-reveal" data-delay="0.7" id="hero-actions">
                    <button
                      type="button"
                      className="hero-primary-btn"
                      id="hero-launch-btn"
                      onClick={() => onScrollTo('live-demo-section')}
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Launch Live Demo</span>
                    </button>
                    <button
                      type="button"
                      className="hero-secondary-btn"
                      id="hero-benchmarks-btn"
                      onClick={() => onScrollTo('trust-tech-section')}
                    >
                      <Cpu size={13} />
                      <span>Benchmarks &amp; Spec</span>
                    </button>
                  </div>
                </div>

                <article className="product-card interactive" id="product-card">
                  <div className="product-thumb" id="product-thumb" aria-hidden="true">
                    <ShieldCheck size={26} />
                  </div>
                  <div className="product-body" id="product-body">
                    <h2 id="product-title">DETECTION ENGINE // READY</h2>
                    <p className="fade-up-reveal" data-delay="1.05" id="product-desc">
                      Neural inference pipeline online. Real-time spatial, physiological, and spectral anomaly scoring across media.
                    </p>
                  </div>
                  <button
                    className="cart-btn fade-up-reveal"
                    data-delay="1.15"
                    type="button"
                    id="cart-btn"
                    onClick={() => onScrollTo('live-demo-section')}
                  >
                    <Activity size={11} />
                    <span>Test Live Sample</span>
                  </button>
                </article>
              </div>

              <div className="specs interactive" id="specs-card">
                <h3 className="words-pull-up" id="specs-title">OmniFace Specs</h3>
                <div className="spec-row fade-up-reveal" data-delay="1.2" id="spec-vision">
                  <span className="spec-label">Modalities</span>
                  <span className="spec-value">Image, Video &amp; Audio</span>
                </div>
                <div className="spec-row fade-up-reveal" data-delay="1.3" id="spec-nerve">
                  <span className="spec-label">Core Backbone</span>
                  <span className="spec-value">EfficientNet-B4 + ViT</span>
                </div>
                <div className="spec-row fade-up-reveal" data-delay="1.4" id="spec-reflex">
                  <span className="spec-label">Biological</span>
                  <span className="spec-value">rPPG Hemoglobin Pulse</span>
                </div>
                <div className="spec-row fade-up-reveal" data-delay="1.5" id="spec-armor">
                  <span className="spec-label">Latency / Acc.</span>
                  <span className="spec-value">112ms // 98.4% AUC</span>
                </div>
              </div>
            </div>

            {/* Bottom Scroll Prompt */}
            <button
              id="hero-scroll-prompt"
              onClick={() => onScrollTo('problem-section')}
              className="fade-up-reveal"
              data-delay="1.6"
              style={{
                position: 'absolute',
                bottom: 'clamp(14px, 2vh, 22px)',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 25,
                background: '#0A0A0A',
                border: '1px solid #262626',
                borderRadius: '100px',
                padding: '6px 16px',
                fontFamily: 'var(--f-display)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#FFFFFF',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>Explore Forensics</span>
              <ChevronDown size={14} color="#FFFFFF" />
            </button>
          </section>
        </div>

        {/* =========================================================================
            STAGE LAYER 2: PROBLEM SECTION (EMERGES FROM BLACK)
            ========================================================================= */}
        <div
          ref={problemLayerRef}
          id="problem-stage-layer"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 20,
            willChange: 'transform, opacity',
            overflowY: 'auto',
            backgroundColor: '#000000',
          }}
        >
          <ProblemSection />
        </div>
      </div>
    </div>
  );
}
