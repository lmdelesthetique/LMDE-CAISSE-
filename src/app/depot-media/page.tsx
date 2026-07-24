'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface MediaItem {
  id: string;
  file_name: string;
  file_type: 'photo' | 'video';
  mime_type: string;
  uploader_name: string;
  admin_note: string | null;
  size_bytes: number;
  created_at: string;
  url: string | null;
}

const SQL_SETUP = `CREATE TABLE IF NOT EXISTS media_depot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  uploader_name text NOT NULL,
  admin_note text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);`;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DepotMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tableExists, setTableExists] = useState(true);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploaderName, setUploaderName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Note editing
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filter
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/media-depot');
    const json = await res.json();
    setTableExists(json.tableExists !== false);
    setItems(json.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !uploaderName.trim()) return;
    setUploading(true);
    setUploadMsg(null);
    const form = new FormData();
    form.append('file', file);
    form.append('uploader_name', uploaderName.trim());
    const res = await fetch('/api/media-depot', { method: 'POST', body: form });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) {
      setUploadMsg({ type: 'err', text: json.error ?? 'Erreur upload' });
    } else {
      setUploadMsg({ type: 'ok', text: 'Fichier déposé avec succès !' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    }
  }

  async function saveNote(id: string) {
    setSavingNote(true);
    await fetch(`/api/media-depot/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_note: noteValue.trim() || null }),
    });
    setSavingNote(false);
    setEditNoteId(null);
    setItems(prev => prev.map(it => it.id === id ? { ...it, admin_note: noteValue.trim() || null } : it));
  }

  async function handleDownloadMedia(item: MediaItem) {
    const res = await fetch(`/api/media-depot/download?id=${item.id}`);
    const data = await res.json();
    if (!data.url) return;
    const a = document.createElement('a');
    a.href = data.url;
    a.download = item.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce fichier définitivement ?')) return;
    setDeletingId(id);
    await fetch(`/api/media-depot/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    setItems(prev => prev.filter(it => it.id !== id));
  }

  const filtered = filter === 'all' ? items : items.filter(it => it.file_type === filter);
  const totalSize = items.reduce((s, it) => s + (it.size_bytes ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div>
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Retour au menu
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Dépôt Photo & Vidéo</h1>
          <p className="text-sm text-gray-500 mt-1">Les employées déposent ici les photos et vidéos prises en boutique.</p>
        </div>

        {/* Setup banner */}
        {!tableExists && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">Configuration requise — créez la table dans Supabase :</p>
            <pre className="text-xs bg-amber-100 rounded p-3 overflow-x-auto text-amber-900 whitespace-pre-wrap">{SQL_SETUP}</pre>
          </div>
        )}

        {/* ── Upload Form ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Déposer un fichier</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Ton prénom</label>
              <input
                type="text"
                value={uploaderName}
                onChange={e => setUploaderName(e.target.value)}
                placeholder="Ex : Margarita"
                required
                className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Fichier (photo ou vidéo)</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,video/mp4,video/quicktime,video/x-m4v,image/heic,image/heif"
                required
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
              />
              {file && (
                <p className="text-xs text-gray-400 mt-1">
                  {file.name} — {formatSize(file.size)}
                  {file.type.startsWith('video/') ? ' 🎬' : ' 🖼️'}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={uploading || !file || !uploaderName.trim()}
              className="px-6 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-violet-700 transition-colors"
            >
              {uploading ? 'Envoi en cours...' : 'Déposer'}
            </button>
            {uploadMsg && (
              <p className={`text-sm font-medium ${uploadMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                {uploadMsg.type === 'ok' ? '✅' : '❌'} {uploadMsg.text}
              </p>
            )}
          </form>
        </div>

        {/* ── Gallery ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Contenu déposé</h2>
              <p className="text-xs text-gray-400">{items.length} fichier{items.length !== 1 ? 's' : ''} — {formatSize(totalSize)} total</p>
            </div>
            <div className="flex gap-2">
              {(['all', 'photo', 'video'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    filter === f ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all' ? 'Tout' : f === 'photo' ? '🖼️ Photos' : '🎬 Vidéos'}
                </button>
              ))}
              <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                ↻ Actualiser
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {items.length === 0 ? 'Aucun fichier déposé pour le moment.' : 'Aucun fichier dans cette catégorie.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(item => (
                <div key={item.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                  {/* Preview */}
                  <div className="bg-gray-100 relative" style={{ height: 180 }}>
                    {item.url ? (
                      item.file_type === 'photo' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt={item.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <video src={item.url} controls className="w-full h-full object-cover" preload="metadata" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        {item.file_type === 'photo' ? '🖼️' : '🎬'}
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                      item.file_type === 'photo' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {item.file_type === 'photo' ? 'PHOTO' : 'VIDÉO'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-[140px]" title={item.file_name}>{item.file_name}</p>
                        <p className="text-xs text-gray-500">par <span className="font-semibold text-violet-700">{item.uploader_name}</span></p>
                        <p className="text-[10px] text-gray-400">{formatDate(item.created_at)} · {formatSize(item.size_bytes ?? 0)}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleDownloadMedia(item)}
                          className="text-[10px] px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg font-semibold hover:bg-green-100 transition-colors whitespace-nowrap"
                        >
                          ⬇ Télécharger
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="text-[10px] px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded-lg font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {deletingId === item.id ? '...' : '🗑 Supprimer'}
                        </button>
                      </div>
                    </div>

                    {/* Admin note */}
                    {editNoteId === item.id ? (
                      <div className="space-y-1">
                        <textarea
                          value={noteValue}
                          onChange={e => setNoteValue(e.target.value)}
                          rows={2}
                          placeholder="Comment utiliser ce contenu..."
                          className="w-full text-xs border border-violet-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveNote(item.id)}
                            disabled={savingNote}
                            className="text-[10px] px-3 py-1 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
                          >
                            {savingNote ? '...' : 'Enregistrer'}
                          </button>
                          <button
                            onClick={() => setEditNoteId(null)}
                            className="text-[10px] px-3 py-1 bg-gray-100 text-gray-600 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditNoteId(item.id); setNoteValue(item.admin_note ?? ''); }}
                        className={`w-full text-left text-xs rounded-lg px-2 py-1.5 border transition-colors ${
                          item.admin_note
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-dashed border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-500'
                        }`}
                      >
                        {item.admin_note ?? '+ Ajouter une note d\'utilisation'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
