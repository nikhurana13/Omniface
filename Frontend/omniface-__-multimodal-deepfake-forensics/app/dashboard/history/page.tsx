'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  History as HistoryIcon, 
  Search, 
  Video, 
  Image as ImageIcon, 
  Music, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Trash2, 
  Download, 
  ChevronRight,
  X,
  FileText,
  Activity,
  ShieldCheck,
  Printer,
  FileCode,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { historyService } from '@/lib/api/history';
import { AnalysisResult } from '@/lib/api/analysis';
import { reportService } from '@/lib/api/reports';
import Link from 'next/link';

export default function HistoryPage() {
  const [records, setRecords] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedVerdict, setSelectedVerdict] = useState<string>('ALL');
  const [selectedItem, setSelectedItem] = useState<AnalysisResult | null>(null);

  const loadRecords = async () => {
    setRecords(historyService.getAll());
    try {
      const merged = await historyService.fetchReports();
      setRecords(merged);
    } catch {
      // Keep local records if network fails
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all forensic analysis history?')) {
      historyService.clear();
      setRecords([]);
      setSelectedItem(null);
    }
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this forensic record?')) {
      historyService.deleteRecord(id);
      loadRecords();
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    }
  };

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const name = (rec.fileName || '').toLowerCase();
      const verdict = (rec.classification || '').toLowerCase();
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || verdict.includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'ALL' || (rec.mediaType || '').toUpperCase() === selectedType;
      
      let matchesVerdict = true;
      if (selectedVerdict === 'DEEPFAKE') {
        matchesVerdict = rec.isSynthetic || rec.classification?.includes('DEEPFAKE');
      } else if (selectedVerdict === 'AUTHENTIC') {
        matchesVerdict = !rec.isSynthetic && rec.classification?.includes('AUTHENTIC');
      }

      return matchesSearch && matchesType && matchesVerdict;
    });
  }, [records, searchTerm, selectedType, selectedVerdict]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = records.length;
    const deepfakes = records.filter((r) => r.isSynthetic || r.classification?.includes('DEEPFAKE')).length;
    const authentic = records.filter((r) => !r.isSynthetic && r.classification?.includes('AUTHENTIC')).length;
    const avgConfidence = total > 0 ? (records.reduce((acc, r) => acc + (r.confidence || 0), 0) / total).toFixed(1) : '0.0';
    const deepfakeRate = total > 0 ? Math.round((deepfakes / total) * 100) : 0;

    return { total, deepfakes, authentic, avgConfidence, deepfakeRate };
  }, [records]);

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
            Analysis History
          </h1>
          <p style={{
            fontFamily: 'var(--f-sans)',
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.65)',
            margin: 0,
          }}>
            Review, inspect, and export complete forensic audit logs and multi-signal verdicts.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {records.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                fontFamily: 'var(--f-display)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Trash2 size={13} />
              <span>Clear History</span>
            </button>
          )}

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
            <span>+ New Analysis</span>
          </Link>
        </div>
      </div>

      {/* Forensic Telemetry Quick Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
      }}>
        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase' }}>TOTAL INSPECTED</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#FFFFFF', marginTop: '4px' }}>{stats.total}</div>
        </div>

        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#EF4444', textTransform: 'uppercase' }}>DEEPFAKES FLAGGED</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#EF4444', marginTop: '4px' }}>{stats.deepfakes}</div>
        </div>

        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#10B981', textTransform: 'uppercase' }}>AUTHENTIC VERIFIED</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>{stats.authentic}</div>
        </div>

        <div style={{
          backgroundColor: 'rgba(13, 17, 26, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: '#00E5FF', textTransform: 'uppercase' }}>AVG CONFIDENCE</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: '26px', fontWeight: 800, color: '#00E5FF', marginTop: '4px' }}>{stats.avgConfidence}%</div>
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
        padding: '14px 18px',
      }}>
        {/* Search input */}
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
            placeholder="Search by filename, hash, or verdict..."
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

        {/* Modality & Verdict Filter Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {['ALL', 'VIDEO', 'IMAGE', 'AUDIO'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontFamily: 'var(--f-display)',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: selectedType === type ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                  color: selectedType === type ? '#00E5FF' : 'rgba(255, 255, 255, 0.65)',
                  transition: 'all 0.15s ease',
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {[
              { id: 'ALL', label: 'All Verdicts' },
              { id: 'DEEPFAKE', label: 'Deepfakes' },
              { id: 'AUTHENTIC', label: 'Authentic' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVerdict(v.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontFamily: 'var(--f-display)',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: selectedVerdict === v.id ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: selectedVerdict === v.id ? '#FFFFFF' : 'rgba(255, 255, 255, 0.55)',
                  transition: 'all 0.15s ease',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div style={{
        backgroundColor: 'rgba(13, 17, 26, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
              }}>
                <th style={{ padding: '14px 20px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>File</th>
                <th style={{ padding: '14px 20px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Type</th>
                <th style={{ padding: '14px 20px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Result</th>
                <th style={{ padding: '14px 20px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Confidence</th>
                <th style={{ padding: '14px 20px', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Timestamp</th>
                <th style={{ padding: '14px 20px', textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((item) => {
                  const isDeepfake = item.isSynthetic || item.classification?.includes('DEEPFAKE');
                  const isAuthentic = !item.isSynthetic && item.classification?.includes('AUTHENTIC');

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0, 229, 255, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* File Name */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#00E5FF',
                          }}>
                            {item.mediaType === 'video' && <Video size={16} />}
                            {item.mediaType === 'image' && <ImageIcon size={16} />}
                            {item.mediaType === 'audio' && <Music size={16} />}
                          </div>
                          <div>
                            <div style={{ fontFamily: 'var(--f-sans)', fontSize: '13.5px', fontWeight: 600, color: '#FFFFFF' }}>
                              {item.fileName}
                            </div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '2px' }}>
                              {item.fileSize || 'Standard Media'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Modality Type */}
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          fontFamily: 'var(--f-mono)',
                          fontSize: '11px',
                          color: '#00E5FF',
                          backgroundColor: 'rgba(0, 229, 255, 0.08)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                        }}>
                          {item.mediaType}
                        </span>
                      </td>

                      {/* Result / Classification */}
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          fontFamily: 'var(--f-display)',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: isDeepfake ? '#EF4444' : isAuthentic ? '#10B981' : '#F59E0B',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}>
                          {isDeepfake && <AlertTriangle size={13} />}
                          {isAuthentic && <CheckCircle2 size={13} />}
                          {!isDeepfake && !isAuthentic && <Info size={13} />}
                          <span>{item.classification}</span>
                        </span>
                      </td>

                      {/* Confidence */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '56px',
                            height: '5px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '100px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(100, item.confidence || 0)}%`,
                              height: '100%',
                              backgroundColor: isDeepfake ? '#EF4444' : isAuthentic ? '#10B981' : '#F59E0B',
                            }} />
                          </div>
                          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}>
                            {item.confidence?.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '16px 20px', fontFamily: 'var(--f-mono)', fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        {new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      </td>

                      {/* Action Chevron & Delete */}
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            title="Delete Record"
                            onClick={(e) => handleDeleteItem(item.id, e)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'rgba(255, 255, 255, 0.3)',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.3)')}
                          >
                            <Trash2 size={14} />
                          </button>

                          <button
                            type="button"
                            title="View Forensic Dossier"
                            onClick={() => setSelectedItem(item)}
                            style={{
                              background: 'rgba(0, 229, 255, 0.1)',
                              border: '1px solid rgba(0, 229, 255, 0.25)',
                              borderRadius: '6px',
                              color: '#00E5FF',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontFamily: 'var(--f-display)',
                              fontSize: '10.5px',
                              fontWeight: 600,
                            }}
                          >
                            <span>Inspect</span>
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <HistoryIcon size={32} color="rgba(255, 255, 255, 0.2)" />
                      <span style={{ fontFamily: 'var(--f-sans)', fontSize: '14px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        No forensic analysis records match your search criteria.
                      </span>
                      <Link
                        href="/dashboard"
                        style={{
                          marginTop: '8px',
                          fontFamily: 'var(--f-display)',
                          fontSize: '12px',
                          color: '#00E5FF',
                          textDecoration: 'none',
                        }}
                      >
                        Start a new media verification scan →
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 
        =============================================================================
        INTERACTIVE RESULT DETAIL MODAL / FORENSIC DOSSIER
        =============================================================================
      */}
      {selectedItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(12px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#0A0E17',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '16px',
              padding: '28px',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(0, 229, 255, 0.15)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={22} color="#00E5FF" />
                <div>
                  <h3 style={{ fontFamily: 'var(--f-display)', fontSize: '17px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                    Forensic Dossier #{selectedItem.id.slice(0, 12)}
                  </h3>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                    {selectedItem.fileName} ({selectedItem.fileSize || 'Media File'})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.6)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Verdict Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                selectedItem.isSynthetic || selectedItem.classification?.includes('DEEPFAKE')
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(16, 185, 129, 0.4)'
              }`,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'rgba(255, 255, 255, 0.45)' }}>CLASSIFICATION VERDICT</div>
                <div style={{
                  fontFamily: 'var(--f-display)',
                  fontSize: '20px',
                  fontWeight: 800,
                  color: selectedItem.isSynthetic || selectedItem.classification?.includes('DEEPFAKE') ? '#EF4444' : '#10B981',
                  marginTop: '2px',
                }}>
                  {selectedItem.classification}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10px', color: 'rgba(255, 255, 255, 0.45)' }}>CONFIDENCE SCORE</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: '22px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                  {selectedItem.confidence?.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Cryptographic Attestation Metadata */}
            <div style={{
              backgroundColor: 'rgba(0, 229, 255, 0.04)',
              border: '1px solid rgba(0, 229, 255, 0.15)',
              borderRadius: '8px',
              padding: '12px 16px',
            }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10.5px', color: '#00E5FF', textTransform: 'uppercase', marginBottom: '4px' }}>SHA-256 INTEGRITY DIGEST</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '11.5px', color: '#FFFFFF', wordBreak: 'break-all' }}>{selectedItem.sha256}</div>
            </div>

            {/* Indicators */}
            <div>
              <h4 style={{ fontFamily: 'var(--f-display)', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginBottom: '10px' }}>
                Extracted Biometric &amp; Neural Signals
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedItem.indicators && selectedItem.indicators.length > 0 ? (
                  selectedItem.indicators.map((ind, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{ind.name}</span>
                        <span style={{
                          fontFamily: 'var(--f-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: ind.status === 'anomalous' ? '#EF4444' : ind.status === 'suspicious' ? '#F59E0B' : '#10B981',
                          textTransform: 'uppercase',
                        }}>
                          {ind.status} ({ind.score}%)
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>{ind.description}</span>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)' }}>Standard multi-signal indicators recorded.</span>
                )}
              </div>
            </div>

            {/* Executive Summary */}
            {selectedItem.summary && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '12px 16px',
              }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', marginBottom: '4px' }}>EXECUTIVE SUMMARY</div>
                <p style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(255, 255, 255, 0.8)', margin: 0 }}>{selectedItem.summary}</p>
              </div>
            )}

            {/* Footer Export Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={() => reportService.exportHTMLDossier(selectedItem)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--f-display)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Printer size={13} />
                <span>Print / HTML</span>
              </button>

              <button
                type="button"
                onClick={() => reportService.exportJSON(selectedItem)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--f-display)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <FileCode size={13} />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={() => reportService.exportTextCertificate(selectedItem)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  backgroundColor: '#00E5FF',
                  color: '#06080D',
                  fontFamily: 'var(--f-display)',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Download size={13} />
                <span>Download Audit Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
