'use client';

import { useEffect, useState } from 'react';

export default function HashtagCooccurrenceView() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/hashtags/cooccurrence')
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
    <div style={{ border: '2px solid #000', padding: '15px', marginBottom: '40px', backgroundColor: '#fafafa' }}>
      <div style={{ display: 'flex', gap: '20px' }}>
        
        {/* Table */}
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
            Top Co-occurring Hashtags
          </h4>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>
            Hashtags that frequently appear in the same post together. Useful for discovering organic topic bridges.
          </p>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#eee' }}>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '6px' }}>Hashtag A</th>
                  <th style={{ padding: '6px' }}>Hashtag B</th>
                  <th style={{ padding: '6px' }}>Co-occurrences</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((pair: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '6px', fontWeight: 'bold', color: '#0066cc' }}>#{pair.tagA}</td>
                    <td style={{ padding: '6px', fontWeight: 'bold', color: '#e67300' }}>#{pair.tagB}</td>
                    <td style={{ padding: '6px' }}>{pair.count} times</td>
                  </tr>
                ))}
                {data.pairs.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '6px', color: '#999' }}>No hashtag pairs found yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats */}
        <div style={{ width: '250px', backgroundColor: '#fff', padding: '15px', border: '1px solid #ddd' }}>
          <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Hashtag Stats</h4>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#666' }}>Unique Tags Paired:</span>
            <strong>{data.uniqueTags.length}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <span style={{ color: '#666' }}>Total Linkages:</span>
            <strong>{data.totalPairs}</strong>
          </div>
          
          <h5 style={{ margin: '0 0 5px 0' }}>Tag Cloud Preview</h5>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {data.uniqueTags.slice(0, 15).map((tag: string) => (
              <span key={tag} style={{ backgroundColor: '#eef', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#333' }}>
              </span>
            ))}
            {data.uniqueTags.length > 15 && <span style={{ fontSize: '11px', color: '#999', alignSelf: 'center' }}>+{data.uniqueTags.length - 15} more</span>}
          </div>
        </div>

      </div>
    </div>
  );
}
