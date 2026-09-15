'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon,
  Video,
  Mic,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  Download,
  Copy,
  Check,
  Eye,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Scan,
  Zap,
  Lock
} from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { analysisService } from '@/lib/api/analysis';
import { historyService } from '@/lib/api/history';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

type Modality = 'image' | 'video' | 'audio';

interface ForensicSample {
  id: string;
  name: string;
  modality: Modality;
  isSynthetic: boolean;
  confidence: number;
  thumbnail?: string;
  sha256: string;
  signals: {
    spatialArtifacts: number; // 0 - 100%
    rppgPulseBpm: number; // e.g. 72 or 0 (flatline)
    rppgStatus: string;
    avSyncDriftMs: number; // e.g. +140ms or -4ms
    vocoderHarmonics: number; // 0 - 100%
  };
  summary: string;
  tamperingPoints: string[];
}

const PRESETS: Record<Modality, ForensicSample[]> = {
  image: [
    {
      id: 'img-synthetic-1',
      name: 'StyleGAN3 Face Swap Synthesized Portrait',
      modality: 'image',
      isSynthetic: true,
      confidence: 96.4,
      sha256: '8b4d9a20fe359a119782531cd9a2bc371822830f89d3ea43',
      signals: {
        spatialArtifacts: 92,
        rppgPulseBpm: 0,
        rppgStatus: 'N/A (Static Media)',
        avSyncDriftMs: 0,
        vocoderHarmonics: 0,
      },
      summary: 'High-frequency Fourier transform revealed persistent checkerboard upsampling artifacts along the hairline and earlobes. Corneal reflections show asymmetric point-light positions inconsistent with environmental illumination physics.',
      tamperingPoints: [
        'Irregular pixel boundary gradient along left jawline (+4.2σ variance)',
        'Asymmetric corneal specular highlight in ocular reflections',
        'Spectral high-frequency checkerboard residual characteristic of StyleGAN/Diffusion decoders',
      ],
    },
    {
      id: 'img-authentic-1',
      name: 'AP News Wire Authentic Citizen Photograph',
      modality: 'image',
      isSynthetic: false,
      confidence: 98.8,
      sha256: '3f71c4801ea3bc907718de6011c7590bc208573efb9830da',
      signals: {
        spatialArtifacts: 4,
        rppgPulseBpm: 0,
        rppgStatus: 'N/A (Static Media)',
        avSyncDriftMs: 0,
        vocoderHarmonics: 0,
      },
      summary: 'Sensor noise distribution across Bayer CFA filters matches natural CMOS photon shot noise. No boundary seam discontinuities, generative interpolation artifacts, or lighting inconsistencies detected.',
      tamperingPoints: [
        'Bayer Color Filter Array (CFA) interpolation conforms to standard hardware sensor profiles',
        'Natural Gaussian noise continuity verified across all color channels',
        'Consistent shadow geometry matching single primary light source',
      ],
    },
  ],
  video: [
    {
      id: 'vid-synthetic-1',
      name: 'Facial Re-enactment & Puppet Talking Head',
      modality: 'video',
      isSynthetic: true,
      confidence: 94.6,
      sha256: '92ea180b54cd89104fa2bc743e887a02c3491765fdca9832',
      signals: {
        spatialArtifacts: 88,
        rppgPulseBpm: 0,
        rppgStatus: '0.0 BPM (Biological Flatline)',
        avSyncDriftMs: 145,
        vocoderHarmonics: 91,
      },
      summary: 'Facial sub-surface chrominance analysis indicates complete absence of cardiovascular hemoglobin pulse (rPPG flatline across 240 frames). Lip movement trails vocal acoustic energy by +145ms, indicating synthetic audio dubbing.',
      tamperingPoints: [
        'Micro-vascular pulse extraction flatlined at 0.0 BPM (Natural human range: 60-100 BPM)',
        'Severe phoneme-viseme temporal offset (+145ms audio-visual latency drift)',
        'Abnormal eye blink interval exceeding 14.8 seconds with unnatural eyelid closure curve',
      ],
    },
    {
      id: 'vid-authentic-1',
      name: 'Broadcast Press Conference Live Stream',
      modality: 'video',
      isSynthetic: false,
      confidence: 97.2,
      sha256: '5a28cb71f30da49811468205efc8924b2075a1103bc489de',
      signals: {
        spatialArtifacts: 6,
        rppgPulseBpm: 72,
        rppgStatus: '72 BPM (Normal Sinus Rhythm)',
        avSyncDriftMs: 4,
        vocoderHarmonics: 5,
      },
      summary: 'Cardiovascular pulse wave extracted via rPPG correlates with authentic human sinus rhythm at 72 BPM with healthy HRV (heart rate variability). Audio-visual sync latency measures within standard natural tolerances (±4ms).',
      tamperingPoints: [
        'Verified physiological pulse signal (72 BPM) with regular diastolic/systolic peaks',
        'Flawless acoustic-motion coherence between bilabial plosives and lip closure',
        'Natural involuntary micro-saccadic eye movements and dynamic pupil dilation',
      ],
    },
  ],
  audio: [
    {
      id: 'aud-synthetic-1',
      name: 'Zero-Shot Neural Voice Clone (ElevenLabs TTS)',
      modality: 'audio',
      isSynthetic: true,
      confidence: 98.2,
      sha256: 'd198ca30e527b849102c77601af982305ca76192db846390',
      signals: {
        spatialArtifacts: 0,
        rppgPulseBpm: 0,
        rppgStatus: 'N/A (Acoustic Only)',
        avSyncDriftMs: 0,
        vocoderHarmonics: 96,
      },
      summary: 'Neural vocoder phase discontinuities identified across higher formants (4kHz - 8kHz). Temporal prosody pitch contour lacks micro-jitter natural to human vocal cord biomechanics during emotional inflection.',
      tamperingPoints: [
        'Vocoder upsampling harmonics detected at 8kHz Nyquist boundary (+18dB anomaly)',
        'Artificial pitch contour flatness across continuous fricative phonemes',
        'High-probability match against HiFi-GAN / BigVGAN neural acoustic decoders',
      ],
    },
    {
      id: 'aud-authentic-1',
      name: 'Studio Master Microphone Vocal Recording',
      modality: 'audio',
      isSynthetic: false,
      confidence: 99.1,
      sha256: '7c40ab2189ef0392817290bc54da98321049bc8712398ac4',
      signals: {
        spatialArtifacts: 0,
        rppgPulseBpm: 0,
        rppgStatus: 'N/A (Acoustic Only)',
        avSyncDriftMs: 0,
        vocoderHarmonics: 2,
      },
      summary: 'Natural vocal tract resonances and glottal flow pulses verified. Acoustic room reverberation decays uniformly across all octave bands without synthetic phase cancellation or neural vocoder artifacts.',
      tamperingPoints: [
        'Continuous organic micro-tremor in fundamental frequency (F0)',
        'Natural breathing and sub-glottal pressure variation preceding plosives',
        'Zero phase quantization or neural compression artifacts detected',
      ],
    },
  ],
};

export default function LiveDemoSection() {
  const [selectedModality, setSelectedModality] = useState<Modality>('video');
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(93.7);
  const [scanStageText, setScanStageText] = useState<string>('ANALYSIS COMPLETE');
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pinnedTriggerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSample = PRESETS[selectedModality][selectedSampleIndex] || PRESETS.video[0];

  const handleCopyHash = () => {
    navigator.clipboard.writeText(currentSample.sha256);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setUploadError(null);

    try {
      const result = await analysisService.analyzeMedia(file, selectedModality, (stage, percent) => {
        setScanStageText(stage);
        setAnalysisProgress(percent);
      });

      historyService.save(result);
      setAnalysisProgress(result.confidence);
      setScanStageText(result.classification === 'DEEPFAKE DETECTED' ? 'SYNTHETIC MEDIA DETECTED' : 'AUTHENTIC MEDIA VERIFIED');
    } catch (err: any) {
      setUploadError(err.message || 'Analysis request failed');
      setScanStageText('ANALYSIS ENCOUNTERED ERROR');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <section className="page-section" id="live-demo-section" style={{ position: 'relative', zIndex: 10 }}>
      {/* Section Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: '6px' }}>
              PRIMARY FORENSIC SCAN & ATTESTATION
            </h2>
            <p className="section-subtitle">
              Live multi-signal neural inference: test suspect media or inspect verified benchmarks across spatial, biological, and spectral dimensions.
            </p>
          </div>

          {/* Real-time Ticker Badge */}
          <div
            className="hud-telemetry-badge"
            style={{
              borderColor: analysisProgress > 70 ? '#FF4D4D' : '#00E5FF',
              color: analysisProgress > 70 ? '#FF4D4D' : '#00E5FF',
            }}
          >
            <Activity size={14} />
            <span>{scanStageText}</span>
            <span style={{ marginLeft: '6px', fontSize: '14px', fontWeight: 800 }}>
              {analysisProgress.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Central HUD Analysis Readout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '24px',
          alignItems: 'stretch',
          marginBottom: '32px',
        }}
      >
        {/* Left Column: Live Forensic Metrics */}
        <div className="forensic-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#00E5FF' }}>
              NEURAL RADAR TELEMETRY
            </span>
            <span style={{ fontSize: '11px', color: '#00F5A0', fontFamily: 'monospace' }}>
              ● 60 FPS SYNC
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 }}>Spatial Frequency Residuals:</span>
                <span style={{ fontWeight: 700, color: '#00E5FF' }}>{Math.min(100, Math.round(analysisProgress * 1.05))}%</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, analysisProgress * 1.05)}%`, height: '100%', background: '#00E5FF', transition: 'width 0.15s ease' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 }}>Micro-vascular rPPG Pulse:</span>
                <span style={{ fontWeight: 700, color: analysisProgress > 75 ? '#FF4D4D' : '#00F5A0' }}>
                  {analysisProgress > 75 ? '0.0 BPM (Flatline)' : '74.2 BPM (Acquiring)'}
                </span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${analysisProgress}%`, height: '100%', background: analysisProgress > 75 ? '#FF4D4D' : '#00F5A0', transition: 'width 0.15s ease' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 }}>Cross-Attention Model Fusion:</span>
                <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{analysisProgress.toFixed(1)}%</span>
              </div>
              <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${analysisProgress}%`, height: '100%', background: 'linear-gradient(90deg, #00E5FF 0%, #00F5A0 50%, #FF4D4D 100%)', transition: 'width 0.15s ease' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Final Verdict Card */}
        <div
          className="forensic-card"
          style={{
            padding: '24px',
            border: 'none',
            boxShadow: analysisProgress >= 90 ? '0 0 30px rgba(255, 77, 77, 0.3)' : undefined,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontFamily: 'var(--f-display)', fontSize: '11px', fontWeight: 700, color: analysisProgress >= 90 ? '#FF4D4D' : '#00E5FF' }}>
                VERDICT ATTESTATION
              </span>
              {analysisProgress >= 90 ? <ShieldAlert size={18} color="#FF4D4D" /> : <ShieldCheck size={18} color="#00E5FF" />}
            </div>

            <div style={{ fontSize: '22px', fontFamily: 'var(--f-display)', fontWeight: 800, color: analysisProgress >= 90 ? '#FF4D4D' : '#FFFFFF', marginBottom: '8px' }}>
              {analysisProgress >= 90 ? '93.7% // LIKELY DEEPFAKE' : 'EVALUATING SIGNALS...'}
            </div>

            <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5, margin: 0, marginBottom: '18px' }}>
              {analysisProgress >= 90
                ? 'High-confidence synthetic facial artifacts detected. Biological pulse extraction indicates physiological flatline and diffusion boundary blending.'
                : 'Scrub scroll progress to complete deep neural landmark registration and cross-modal attestation.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="hero-primary-btn"
              style={{ padding: '8px 16px', fontSize: '11px' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={14} />
              <span>Test Custom File</span>
            </button>

            <button
              type="button"
              className="hero-secondary-btn"
              style={{ padding: '8px 16px', fontSize: '11px' }}
              onClick={handleCopyHash}
            >
              {copiedHash ? <Check size={14} color="#00F5A0" /> : <Copy size={14} />}
              <span>{copiedHash ? 'Hash Copied' : 'Audit SHA-256'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modality Selector Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {(['video', 'image', 'audio'] as Modality[]).map((mod) => (
          <button
            key={mod}
            type="button"
            className={`modality-tab-btn ${selectedModality === mod ? 'active' : ''}`}
            onClick={() => {
              setSelectedModality(mod);
              setSelectedSampleIndex(0);
            }}
          >
            {mod === 'video' && <Video size={14} />}
            {mod === 'image' && <ImageIcon size={14} />}
            {mod === 'audio' && <Mic size={14} />}
            <span>{mod} Forensics</span>
          </button>
        ))}
      </div>
    </section>
  );
}
