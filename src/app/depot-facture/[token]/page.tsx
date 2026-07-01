'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';

type PageState = 'loading' | 'ready' | 'uploading' | 'success' | 'already_done' | 'error' | 'not_found';

export default function DepotFacturePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invoice-upload/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setState('not_found'); return; }
        setOrderNumber(data.orderNumber);
        setSupplierName(data.supplierName ?? '');
        setState(data.alreadyReceived ? 'already_done' : 'ready');
      })
      .catch(() => setState('error'));
  }, [token]);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) {
      setErrorMsg('Format non accepté. Merci de déposer un fichier PDF.');
      return;
    }
    setErrorMsg('');
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setState('uploading');
    try {
      const fd = new FormData();
      fd.append('invoice', file);
      const res = await fetch(`/api/invoice-upload/${token}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur lors de l\'envoi'); setState('ready'); return; }
      setState('success');
    } catch {
      setErrorMsg('Erreur réseau. Veuillez réessayer.');
      setState('ready');
    }
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0] ?? null);
    },
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #fdf4ff 0%, #fff 60%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Logo / Brand */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
          Le Monde de l'Esthétique
        </p>
      </div>

      <div style={{
        width: '100%', maxWidth: 460,
        background: '#fff', borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
        overflow: 'hidden',
      }}>

        {/* ── Loading ── */}
        {state === 'loading' && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e9d5ff', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#6b7280', fontSize: 14 }}>Chargement…</p>
          </div>
        )}

        {/* ── Not found ── */}
        {state === 'not_found' && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 8 }}>Lien invalide</p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>Ce lien de dépôt n'existe pas ou a expiré.</p>
          </div>
        )}

        {/* ── Already done ── */}
        {state === 'already_done' && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#111827', marginBottom: 8 }}>Facture déjà reçue</p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>Votre facture pour la commande <strong>{orderNumber}</strong> a bien été transmise.</p>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 16 }}>Vous pouvez fermer cette page.</p>
          </div>
        )}

        {/* ── Success ── */}
        {state === 'success' && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <p style={{ fontWeight: 700, fontSize: 17, color: '#111827', marginBottom: 8 }}>Facture envoyée !</p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>Votre facture pour la commande <strong>{orderNumber}</strong> a bien été reçue.</p>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 16 }}>Vous pouvez fermer cette page.</p>
          </div>
        )}

        {/* ── Ready / Uploading ── */}
        {(state === 'ready' || state === 'uploading') && (
          <>
            <div style={{ padding: '28px 28px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <p style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 6px' }}>
                Bon de commande
              </p>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>
                {orderNumber}
              </h1>
              {supplierName && (
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{supplierName}</p>
              )}
            </div>

            <div style={{ padding: '24px 28px 28px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>
                Déposez votre facture PDF ici :
              </p>

              {/* Drop zone */}
              <div
                {...dropProps}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#8b5cf6' : file ? '#10b981' : '#d1d5db'}`,
                  borderRadius: 14,
                  padding: '32px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragOver ? '#f5f3ff' : file ? '#f0fdf4' : '#fafafa',
                  transition: 'all 0.15s',
                  marginBottom: 16,
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                    <p style={{ fontWeight: 600, color: '#059669', fontSize: 14, margin: '0 0 4px' }}>{file.name}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                      {(file.size / 1024 / 1024).toFixed(1)} Mo — cliquer pour changer
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📎</div>
                    <p style={{ fontWeight: 600, color: '#374151', fontSize: 14, margin: '0 0 6px' }}>
                      Choisir mon fichier PDF
                    </p>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                      ou glisser-déposer ici
                    </p>
                  </>
                )}
              </div>

              {errorMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: '#fef2f2', border: '1px solid #fecaca',
                  color: '#dc2626', fontSize: 13, marginBottom: 14,
                }}>
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!file || state === 'uploading'}
                style={{
                  width: '100%', padding: '14px 0',
                  background: !file || state === 'uploading' ? '#e5e7eb' : '#8b5cf6',
                  color: !file || state === 'uploading' ? '#9ca3af' : '#fff',
                  border: 'none', borderRadius: 12,
                  fontSize: 15, fontWeight: 700,
                  cursor: !file || state === 'uploading' ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}
              >
                {state === 'uploading' ? (
                  <>
                    <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Envoi en cours…
                  </>
                ) : (
                  <>✅ Envoyer ma facture</>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: '#d1d5db', textAlign: 'center' }}>
        Ce lien est strictement personnel à cette commande.
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
