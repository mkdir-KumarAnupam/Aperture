'use client';

import { useEffect, useState } from 'react';

export default function HashtagCooccurrenceView({ q }: { q?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = q ? `/api/hashtags/cooccurrence?q=${encodeURIComponent(q)}` : '/api/hashtags/cooccurrence';
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div style={{ color: 'red', padding: '10px', border: '1px solid red' }}>Error: {error}</div>;
  if (!data) return <div>Loading hashtag pairs...</div>;

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '20px' }}>
        
        {/* Table */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            Top Co-occurring Hashtags
          </h4>
          <p style={{ fontSize: '12px', color: '#333', margin: '0 0 15px 0', fontFamily: 'monospace' }}>
            Hashtags that frequently appear in the same post together. Useful for discovering organic topic bridges.
          </p>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff', borderBottom: '2px solid #000' }}>
                <tr>
                  <th style={{ padding: '8px 12px', color: '#000', fontWeight: 'bold' }}>Hashtag A</th>
                  <th style={{ padding: '8px 12px', color: '#000', fontWeight: 'bold' }}>Hashtag B</th>
                  <th style={{ padding: '8px 12px', color: '#000', fontWeight: 'bold' }}>Co-occurrences</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#000' }}>#{pair.tagA}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#000' }}>#{pair.tagB}</td>
                    <td style={{ padding: '8px 12px', color: '#000', fontFamily: 'monospace' }}>{pair.count} times</td>
                  </tr>
                ))}
                {data.pairs.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#555' }}>No hashtag pairs found yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats */}
        <div style={{ backgroundColor: '#fff', padding: '15px', border: '1px solid #ccc' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#000', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '5px' }}>Hashtag Stats</h4>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span style={{ color: '#333' }}>Unique Tags Paired:</span>
            <strong style={{ color: '#000', fontFamily: 'monospace' }}>{data.uniqueTags.length}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '14px' }}>
            <span style={{ color: '#333' }}>Total Linkages:</span>
            <strong style={{ color: '#000', fontFamily: 'monospace' }}>{data.totalPairs}</strong>
          </div>
          
          <h5 style={{ margin: '0 0 8px 0', color: '#000', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Tag Cloud Preview</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {data.uniqueTags.slice(0, 15).map((tag: string) => (
              <span key={tag} style={{ backgroundColor: '#eee', padding: '4px 8px', fontSize: '12px', color: '#000', border: '1px solid #ccc' }}>
                {tag}
              </span>
            ))}
            {data.uniqueTags.length > 15 && <span style={{ fontSize: '12px', color: '#555', alignSelf: 'center' }}>+{data.uniqueTags.length - 15} more</span>}
          </div>
        </div>

      </div>
    </div>
  );
}
