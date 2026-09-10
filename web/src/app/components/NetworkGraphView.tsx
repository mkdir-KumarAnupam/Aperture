'use client';

import { useEffect, useState } from 'react';

export default function NetworkGraphView({ q }: { q?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = q ? `/api/network/graph?q=${encodeURIComponent(q)}` : '/api/network/graph';
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div style={{ color: 'red', padding: '10px', border: '1px solid red' }}>Error: {error}</div>;
  if (!data) return <div>Loading network graph...</div>;

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        
        {/* Top KOLs */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            Top Key Opinion Leaders (KOLs)
          </h4>
          <p style={{ fontSize: '12px', color: '#333', margin: '0 0 15px 0', fontFamily: 'monospace' }}>
            Ranked by PageRank approximation.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
              <thead style={{ borderBottom: '2px solid #000' }}>
                <tr>
                  <th style={{ padding: '8px 12px', color: '#000', fontWeight: 'bold' }}>Rank</th>
                  <th style={{ padding: '8px 12px', color: '#000', fontWeight: 'bold' }}>Handle</th>
                  <th style={{ padding: '8px 12px', color: '#000', fontWeight: 'bold' }}>Inbound Edges</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.topKOLs.map((node: any, idx: number) => (
                  <tr key={node.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px', color: '#555', fontFamily: 'monospace' }}>#{idx + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#000' }}>@{node.id}</td>
                    <td style={{ padding: '8px 12px', color: '#000', fontFamily: 'monospace' }}>{node.pageRank}</td>
                  </tr>
                ))}
                {data.stats.topKOLs.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No network interactions found yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Network Stats */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '5px' }}>Network Stats</h4>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span style={{ color: '#333' }}>Total Nodes:</span>
            <strong style={{ color: '#000', fontFamily: 'monospace' }}>{data.stats.totalNodes}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '14px' }}>
            <span style={{ color: '#333' }}>Total Edges:</span>
            <strong style={{ color: '#000', fontFamily: 'monospace' }}>{data.stats.totalEdges}</strong>
          </div>

          <h5 style={{ margin: '0 0 8px 0', color: '#000', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Edge Types</h5>
          {Object.entries(data.stats.edgeTypes).map(([type, count]) => (
            <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span style={{ color: '#333', textTransform: 'capitalize' }}>{type}</span>
              <span style={{ color: '#000', fontFamily: 'monospace' }}>{count as number}</span>
            </div>
          ))}

          <h5 style={{ margin: '20px 0 8px 0', color: '#000', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Edges by Trend</h5>
          {Object.entries(data.stats.trendEdges).map(([trend, count]) => (
            <div key={trend} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span style={{ color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                {trend}
              </span>
              <span style={{ color: '#000', fontFamily: 'monospace' }}>{count as number}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
