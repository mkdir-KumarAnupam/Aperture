'use client';

import { useEffect, useState } from 'react';

export default function NetworkGraphView() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/network/graph')
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
    <div style={{ border: '2px solid #000', padding: '15px', marginBottom: '40px', backgroundColor: '#fafafa' }}>
      <div style={{ display: 'flex', gap: '20px' }}>
        
        {/* Top KOLs */}
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
            Top Key Opinion Leaders (KOLs)
          </h4>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>
            Ranked by PageRank approximation (most replied-to / retweeted in current dataset).
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#eee', textAlign: 'left' }}>
                <th style={{ padding: '6px' }}>Rank</th>
                <th style={{ padding: '6px' }}>Handle</th>
                <th style={{ padding: '6px' }}>Inbound Edges (Interactions)</th>
              </tr>
            </thead>
            <tbody>
              {data.stats.topKOLs.map((node: any, idx: number) => (
                <tr key={node.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px' }}>#{idx + 1}</td>
                  <td style={{ padding: '6px', fontWeight: 'bold', color: '#0066cc' }}>@{node.id}</td>
                  <td style={{ padding: '6px' }}>{node.pageRank}</td>
                </tr>
              ))}
              {data.stats.topKOLs.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '6px', color: '#999' }}>No network interactions found yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Network Stats */}
        <div style={{ width: '300px', backgroundColor: '#fff', padding: '15px', border: '1px solid #ddd' }}>
          <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Network Stats</h4>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#666' }}>Total Nodes:</span>
            <strong>{data.stats.totalNodes}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <span style={{ color: '#666' }}>Total Edges:</span>
            <strong>{data.stats.totalEdges}</strong>
          </div>

          <h5 style={{ margin: '0 0 5px 0' }}>Edge Types</h5>
          {Object.entries(data.stats.edgeTypes).map(([type, count]) => (
            <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: '#666', textTransform: 'capitalize' }}>{type}</span>
              <span>{count as number}</span>
            </div>
          ))}

          <h5 style={{ margin: '15px 0 5px 0' }}>Edges by Trend</h5>
          {Object.entries(data.stats.trendEdges).map(([trend, count]) => (
            <div key={trend} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span style={{ color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                {trend}
              </span>
              <span>{count as number}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
