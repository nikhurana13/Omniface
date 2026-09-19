'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function ScrollScrubSystem() {
  useEffect(() => {
    // Wait for DOM to be fully laid out and assets ready
    const timer = setTimeout(() => {
      initScrollScrubTimelines();
    }, 100);

    const handleResize = () => {
      ScrollTrigger.refresh();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      ScrollTrigger.getAll().forEach((st) => {
        // Kill only our section timelines, keep global background trigger intact if any
        if (st.vars.id?.startsWith('scrub-')) {
          st.kill();
        }
      });
    };
  }, []);

  function initScrollScrubTimelines() {
    const sectionIds = [
      'problem-section',
      'how-it-works-section',
      'features-section',
      'live-demo-section',
      'trust-tech-section',
      'use-cases-section',
      'cta-footer-section',
    ];

    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (!section) return;

      // Find all animatable items within this section
      const title = section.querySelector('.section-title');
      const subtitle = section.querySelector('.section-subtitle');
      const cards = section.querySelectorAll('.forensic-card, .specs, .product-card');
      const extraItems = section.querySelectorAll('.modality-tab-btn, .hud-telemetry-badge, .cta-actions-wrap');

      // Create a master scrub timeline for this section
      // start: when the section top enters from bottom of viewport (top 95%)
      // end: when section bottom scrolls past top of viewport (bottom 5%)
      const tl = gsap.timeline({
        id: `scrub-${id}`,
        scrollTrigger: {
          trigger: section,
          start: 'top 95%',
          end: 'bottom 5%',
          scrub: 0.4, // Continuous, reversible spring scrub
          invalidateOnRefresh: true,
        },
      });

      // 1. Title Entrance (0% -> 30%) & Exit (70% -> 100%)
      if (title) {
        tl.fromTo(
          title,
          {
            opacity: 0,
            y: 40,
            scale: 0.96,
            filter: 'blur(8px)',
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            ease: 'none',
            duration: 0.3,
          },
          0
        ).to(
          title,
          {
            opacity: 0,
            y: -35,
            scale: 0.97,
            filter: 'blur(6px)',
            ease: 'none',
            duration: 0.3,
          },
          0.7
        );
      }

      // 2. Subtitle Entrance (5% -> 35%) & Exit (68% -> 98%)
      if (subtitle) {
        tl.fromTo(
          subtitle,
          {
            opacity: 0,
            y: 35,
            filter: 'blur(6px)',
          },
          {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            ease: 'none',
            duration: 0.3,
          },
          0.05
        ).to(
          subtitle,
          {
            opacity: 0,
            y: -30,
            filter: 'blur(5px)',
            ease: 'none',
            duration: 0.3,
          },
          0.68
        );
      }

      // 3. Staggered Cards Entrance (10% -> 45%) & Exit (65% -> 100%)
      if (cards && cards.length > 0) {
        cards.forEach((card, idx) => {
          const staggerInOffset = 0.08 + idx * 0.04;
          const staggerOutOffset = 0.65 + idx * 0.03;

          tl.fromTo(
            card,
            {
              opacity: 0,
              y: 50,
              scale: 0.94,
              filter: 'blur(6px)',
            },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              filter: 'blur(0px)',
              ease: 'none',
              duration: 0.32,
            },
            staggerInOffset
          ).to(
            card,
            {
              opacity: 0,
              y: -40,
              scale: 0.97,
              filter: 'blur(5px)',
              ease: 'none',
              duration: 0.32,
            },
            staggerOutOffset
          );
        });
      }

      // 4. Extra controls/buttons/badges (15% -> 50%) & Exit (62% -> 95%)
      if (extraItems && extraItems.length > 0) {
        extraItems.forEach((item, idx) => {
          const inOffset = 0.12 + idx * 0.03;
          const outOffset = 0.62 + idx * 0.03;

          tl.fromTo(
            item,
            {
              opacity: 0,
              y: 30,
              scale: 0.95,
            },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              ease: 'none',
              duration: 0.28,
            },
            inOffset
          ).to(
            item,
            {
              opacity: 0,
              y: -25,
              scale: 0.97,
              ease: 'none',
              duration: 0.28,
            },
            outOffset
          );
        });
      }
    });

    ScrollTrigger.refresh();
  };

  return null;
}
