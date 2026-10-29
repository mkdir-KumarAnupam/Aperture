'use client';

import React, { useState } from 'react';
import { VerifiedBadge } from '../components/VerifiedBadge';

export default function VerifyPage() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch(`/api/integrity/verify?trendId=${encodeURIComponent(identifier)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification query failed');
      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-zinc-100">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          Aperture Blockchain Notary
        </h1>
        <p className="mt-2 text-zinc-400 text-sm">
          Cryptographically verify social media trend metrics against Polygon PoS Smart Contracts.
        </p>
      </div>

      <form onSubmit={handleVerify} className="flex gap-3 mb-8">
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Paste Trend ID (e.g. 9901) or Label (e.g. #AIRevolution)..."
          className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {loading ? 'Verifying on-chain...' : 'Verify Trend'}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm mb-6">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Trend Audit</span>
                <h2 className="text-xl font-bold">{report.trendLabel || `Snapshot #${report.snapshotId}`}</h2>
              </div>
              <VerifiedBadge
                status={report.status}
                polygonScanUrl={report.badge?.polygonScanUrl}
                blockNumber={report.badge?.blockNumber}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
              <div className="p-3 bg-zinc-950/60 rounded-lg">
                <span className="text-zinc-500 block">Anchored Root</span>
                <span className="font-mono text-zinc-300 truncate block" title={report.badge?.merkleRoot}>
                  {report.badge?.merkleRoot || 'N/A'}
                </span>
              </div>
              <div className="p-3 bg-zinc-950/60 rounded-lg">
                <span className="text-zinc-500 block">Polygon Block</span>
                <span className="font-semibold text-zinc-300">
                  {report.badge?.blockNumber ? `#${report.badge.blockNumber}` : 'Pending Confirmation'}
                </span>
              </div>
              <div className="p-3 bg-zinc-950/60 rounded-lg">
                <span className="text-zinc-500 block">Audit Timestamp</span>
                <span className="text-zinc-300">
                  {report.checkedAt ? new Date(report.checkedAt).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {report.tamperedFields && report.tamperedFields.length > 0 && (
            <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30">
              <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-2 mb-3">
                <span>🚨 Altered Fields Detected:</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-400 border-b border-rose-900/40">
                    <tr>
                      <th className="py-2">Field</th>
                      <th className="py-2">On-Chain Expected</th>
                      <th className="py-2">Database Found</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-950/40">
                    {report.tamperedFields.map((f: any, i: number) => (
                      <tr key={i} className="text-rose-200">
                        <td className="py-2.5 font-mono">{f.field}</td>
                        <td className="py-2.5 font-semibold text-emerald-400">{JSON.stringify(f.expectedValue)}</td>
                        <td className="py-2.5 font-semibold text-rose-400 line-through">{JSON.stringify(f.actualValue)}</td>
                        <td className="py-2.5"><span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">TAMPERED</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.intactFields && report.intactFields.length > 0 && (
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
              <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2 mb-3">
                <span>✅ Mathematically Intact Fields ({report.intactFields.length})</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {report.intactFields.map((f: any, i: number) => (
                  <div key={i} className="p-2.5 rounded bg-zinc-950/40 border border-zinc-800/80">
                    <span className="text-zinc-500 block truncate">{f.field}</span>
                    <span className="font-medium text-zinc-300">{JSON.stringify(f.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
