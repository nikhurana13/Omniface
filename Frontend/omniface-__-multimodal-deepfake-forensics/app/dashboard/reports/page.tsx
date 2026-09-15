'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Download, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Layers, 
  Printer,
  FileCode,
  Search,
  Eye,
  X,
  Video,
  Image as ImageIcon,
  Music
} from 'lucide-react';
import { historyService } from '@/lib/api/history';
import { AnalysisResult } from '@/lib/api/analysis';
import { reportService } from '@/lib/api/reports';
import Link from 'next/link';

export default function ReportsPage() {
  const [reports, setReports] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [previewItem, setPreviewItem] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    setReports(historyService.getAll());
    historyService.fetchReports().then((merged) => {
      setReports(merged);
    }).catch(() => {});
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      const name = (item.fileName || '').toLowerCase();
      const hash = (item.sha256 || '').toLowerCase();
      const verdict = (item.classification || '').toLowerCase();
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || hash.includes(searchTerm.toLowerCase()) || verdict.includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'ALL' || (item.mediaType || '').toUpperCase() === selectedType;
      return matchesSearch && matchesType;
    });
  }, [reports, searchTerm, selectedType]);

  const stats = useMemo(() => {
    const total = reports.length;
    const flagged = reports.filter((r) => r.isSynthetic || r.classification?.includes('DEEPFAKE')).length;
    const verified = reports.filter((r) => !r.isSynthetic && r.classification?.includes('AUTHENTIC')).length;
    return { total, flagged, verified };
  }, [reports]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--f-display)',
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            marginBottom: '6px',
          }}>
            Forensic Reports &amp; Dossiers
          </h1>
          <p style={{
            fontFamily: 'var(--f-sans)',
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.65)',
            margin: 0,
          }}>
            Export tamper-evident verification dossiers, JSON payloads, and formal cryptographic attestation certificates.
          </p>
        </div>

        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '8px',
            backgroundColor: '#00E5FF',
            color: '#06080D',
            fontFamily: 'var(--f-display)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            boxShadow: '0 0 16px rgba(0, 229, 255, 0.3)',
          }}
        >
          <span>+ Generate New Report</span>
        </Link>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}>
        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase' }}>AVAILABLE DOSSIERS</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#FFFFFF', marginTop: '4px' }}>{stats.total}</div>
        </div>

        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#EF4444', textTransform: 'uppercase' }}>DEEPFAKE DOSSIERS</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#EF4444', marginTop: '4px' }}>{stats.flagged}</div>
        </div>

        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#10B981', textTransform: 'uppercase' }}>AUTHENTIC CERTIFICATES</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>{stats.verified}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        backgroundColor: 'rgba(13, 17, 26, 0.75)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '12px 18px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '8px 14px',
          minWidth: '260px',
          flex: 1,
        }}>
          <Search size={15} color="rgba(255, 255, 255, 0.4)" />
          <input
            type="text"
            placeholder="Search reports by file name, SHA-256 hash, or classification..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#FFFFFF',
              fontFamily: 'var(--f-sans)',
              fontSize: '13px',
              width: '100%',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {['ALL', 'VIDEO', 'IMAGE', 'AUDIO'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontFamily: 'var(--f-display)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                border: selectedType === type ? '1px solid #00E5FF' : '1px solid transparent',
                backgroundColor: selectedType === type ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                color: selectedType === type ? '#00E5FF' : 'rgba(255, 255, 255, 0.65)',
                transition: 'all 0.15s ease',
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Reports Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
        gap: '20px',
      }}>
        {filteredReports.length > 0 ? (
          filteredReports.map((item) => {
            const isDeepfake = item.isSynthetic || item.classification?.includes('DEEPFAKE');
            const isAuthentic = !item.isSynthetic && item.classification?.includes('AUTHENTIC');

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: 'rgba(13, 17, 26, 0.85)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '20px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0, 229, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  {/* Card Top Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontFamily: 'var(--f-mono)',
                        fontSize: '10px',
                        color: '#00E5FF',
                        backgroundColor: 'rgba(0, 229, 255, 0.08)',
                        border: '1px solid rgba(0, 229, 255, 0.2)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        {item.mediaType === 'video' && <Video size={10} />}
                        {item.mediaType === 'image' && <ImageIcon size={10} />}
                        {item.mediaType === 'audio' && <Music size={10} />}
                        <span>{item.mediaType} DOSSIER</span>
                      </span>
                    </div>

                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)' }}>
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Target File Title */}
                  <h3 style={{
                    fontFamily: 'var(--f-sans)',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginBottom: '12px',
                    wordBreak: 'break-word',
                  }}>
                    {item.fileName}
                  </h3>

                  {/* Verdict & Score */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${isDeepfake ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                    marginBottom: '14px',
                  }}>
                    <span style={{
                      fontFamily: 'var(--f-display)',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: isDeepfake ? '#EF4444' : isAuthentic ? '#10B981' : '#F59E0B',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      {isDeepfake && <AlertTriangle size={14} />}
                      {isAuthentic && <CheckCircle2 size={14} />}
                      {!isDeepfake && !isAuthentic && <ShieldCheck size={14} />}
                      <span>{item.classification}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                      {item.confidence?.toFixed(1)}%
                    </span>
                  </div>

                  {/* SHA-256 Hash */}
                  <div style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontFamily: 'var(--f-mono)',
                    fontSize: '10.5px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: '14px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    SHA: <span style={{ color: '#00E5FF' }}>{item.sha256}</span>
                  </div>

                  {/* Key Indicators Preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {item.indicators && item.indicators.slice(0, 2).map((ind, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>{ind.name}</span>
                        <span style={{
                          fontFamily: 'var(--f-mono)',
                          fontSize: '11px',
                          color: ind.status === 'anomalous' ? '#EF4444' : ind.status === 'suspicious' ? '#F59E0B' : '#10B981',
                        }}>
                          {ind.status} ({ind.score}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Export Actions */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingTop: '16px',
                }}>
                  <button
                    type="button"
                    onClick={() => reportService.exportTextCertificate(item)}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#00E5FF',
                      border: 'none',
                      color: '#06080D',
                      fontFamily: 'var(--f-display)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={13} />
                    <span>REPORT TXT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => reportService.exportHTMLDossier(item)}
                    title="Print / HTML Dossier"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#FFFFFF',
                      fontFamily: 'var(--f-mono)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <Printer size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => reportService.exportJSON(item)}
                    title="Export JSON Metadata"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#FFFFFF',
                      fontFamily: 'var(--f-mono)',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <FileCode size={13} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{
            gridColumn: '1 / -1',
            backgroundColor: 'rgba(13, 17, 26, 0.65)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}>
            <FileText size={36} color="rgba(255, 255, 255, 0.2)" />
            <span style={{ fontSize: '15px', color: 'rgba(255, 255, 255, 0.6)' }}>No forensic reports match your search query.</span>
            <Link
              href="/dashboard"
              style={{
                marginTop: '6px',
                fontFamily: 'var(--f-display)',
                fontSize: '12px',
                color: '#00E5FF',
                textDecoration: 'none',
              }}
            >
              Analyze a media file to create an official report →
            </Link>
          </div>
        )}
      </div>

    </div>
  );
}
