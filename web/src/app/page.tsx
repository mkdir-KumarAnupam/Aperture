import { PrismaClient } from '@prisma/client';
import TrendLifecycleChart from './components/TrendLifecycleChart';
import DemographicsView from './components/DemographicsView';
import NetworkGraphView from './components/NetworkGraphView';
import HashtagCooccurrenceView from './components/HashtagCooccurrenceView';

const prisma = new PrismaClient();

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const sortParam = params.sort === 'engagement' ? 'engagement' : 'time';
  const q = typeof params.q === 'string' ? params.q : '';

  const latestX = await prisma.trend.findFirst({ where: { platform: 'x' }, orderBy: { fetchedAt: 'desc' }, select: { batchId: true } });
  const latestReddit = await prisma.trend.findFirst({ where: { platform: 'reddit' }, orderBy: { fetchedAt: 'desc' }, select: { batchId: true } });

  const xTrends = latestX ? await prisma.trend.findMany({ where: { platform: 'x', batchId: latestX.batchId, ...(q ? { label: { contains: q } } : {}) } }) : [];
  const redditTrends = latestReddit ? await prisma.trend.findMany({ where: { platform: 'reddit', batchId: latestReddit.batchId, ...(q ? { label: { contains: q } } : {}) } }) : [];
  
  let trends = [...xTrends, ...redditTrends];

  trends.sort((a, b) => (b.totalEngagement || 0) - (a.totalEngagement || 0));
  
  const rawPosts = await prisma.post.findMany({ 
    where: q ? { text: { contains: q } } : {},
    orderBy: { timestamp: 'desc' }, 
    take: 50 
  });
  
  const xAuthors = await prisma.author.findMany({ 
    where: { platform: 'x', ...(q ? { OR: [{ handle: { contains: q } }, { bio: { contains: q } }, { authorId: { contains: q } }] } : {}) }, 
    orderBy: { lastFetched: 'desc' }, 
    take: 15 
  });
  const redditAuthors = await prisma.author.findMany({ 
    where: { platform: 'reddit', ...(q ? { OR: [{ handle: { contains: q } }, { bio: { contains: q } }, { authorId: { contains: q } }] } : {}) }, 
    orderBy: { lastFetched: 'desc' }, 
    take: 15 
  });
  const authors = [...xAuthors, ...redditAuthors];

  const posts = rawPosts.map((p) => {
    let engagementStr = "N/A";
    let totalEngagement = 0;
    try {
      const eng = JSON.parse(p.engagement);
      if (p.platform === 'x') {
        const likes = eng.likes || 0;
        const rts = eng.retweets || 0;
        const rep = eng.replies || 0;
        totalEngagement = likes + rts + rep;
        engagementStr = `likes: ${likes}, retweets: ${rts}, replies: ${rep}`;
      } else if (p.platform === 'reddit') {
        const up = eng.upvotes || 0;
        const com = eng.comments || 0;
        totalEngagement = up + com;
        engagementStr = `upvotes: ${up}, comments: ${com}`;
      }
    } catch(e) {}
    return { ...p, engagementStr, totalEngagement };
  });

  if (sortParam === 'engagement') {
    posts.sort((a, b) => b.totalEngagement - a.totalEngagement);
  }

  const trendLabelsWithPosts = [...new Set(posts.map(p => p.trendLabel).filter(Boolean))];

  return (
    <div style={{ padding: '40px', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', color: '#000', backgroundColor: '#fff', minHeight: '100vh', lineHeight: '1.6' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header & Search */}
        <div style={{ marginBottom: '40px', borderBottom: '2px solid #000', paddingBottom: '20px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>Social Intelligence Analysis Corpus</h1>
          <p style={{ color: '#333', margin: '0 0 20px 0', fontSize: '18px', fontStyle: 'italic' }}>Cross-platform data aggregation and trend topology</p>
          
          <form action="/" method="GET" style={{ display: 'flex', gap: '0' }}>
            <input 
              type="text" 
              name="q" 
              defaultValue={q} 
              placeholder="Query dataset..." 
              style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #000', fontFamily: 'monospace' }}
            />
            <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#000', color: '#fff', fontSize: '16px', border: '1px solid #000', cursor: 'pointer', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', textTransform: 'uppercase', fontWeight: 'bold' }}>Query</button>
            {q && (
              <a href="/" style={{ padding: '12px 24px', backgroundColor: '#f0f0f0', color: '#000', fontSize: '16px', textDecoration: 'none', display: 'flex', alignItems: 'center', border: '1px solid #000', borderLeft: 'none' }}>Clear</a>
            )}
          </form>
        </div>

        {/* Top Trends Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginBottom: '50px' }}>
          
          {/* X Trends Card */}
          {(trends.filter(t => t.platform === 'x').length > 0 || !q) && (
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
                TABLE 1: Active Trends (Platform X) {q ? ` - Filtered by "${q}"` : ''}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px', border: '1px solid #000' }}>
                <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #000' }}>
                  <tr>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc', width: '80px' }}>Rank</th>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc' }}>Keyword/Hashtag</th>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc' }}>Volume</th>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc' }}>Engagement</th>
                    <th style={{ padding: '10px' }}>Recorded At</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.filter(t => t.platform === 'x').length === 0 ? <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontStyle: 'italic' }}>No data points available.</td></tr> : null}
                  {trends.filter(t => t.platform === 'x').map((t, idx) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #ccc' }}>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{t.rank ? `#${t.rank}` : '-'}</td>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontWeight: 'bold' }}>{t.label}</td>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{t.volume || '-'}</td>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{t.totalEngagement ?? '-'}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '13px' }}>{new Date(t.fetchedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Reddit Trends Card */}
          {(trends.filter(t => t.platform === 'reddit').length > 0 || !q) && (
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>
                TABLE 2: Active Trends (Platform Reddit) {q ? ` - Filtered by "${q}"` : ''}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px', border: '1px solid #000' }}>
                <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #000' }}>
                  <tr>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc', width: '80px' }}>Rank</th>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc' }}>Subreddit</th>
                    <th style={{ padding: '10px', borderRight: '1px solid #ccc' }}>Entity / Topic</th>
                    <th style={{ padding: '10px' }}>Recorded At</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.filter(t => t.platform === 'reddit').length === 0 ? <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontStyle: 'italic' }}>No data points available.</td></tr> : null}
                  {trends.filter(t => t.platform === 'reddit').map((t, idx) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #ccc' }}>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{t.rank ? `#${t.rank}` : '-'}</td>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{t.subreddit ? `r/${t.subreddit}` : '-'}</td>
                      <td style={{ padding: '10px', borderRight: '1px solid #ccc', fontWeight: 'bold' }}>{t.label}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '13px' }}>{new Date(t.fetchedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Charts Section */}
        <div style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', borderBottom: '2px solid #000', margin: '0 0 20px 0', paddingBottom: '10px', textTransform: 'uppercase' }}>Visualizations & Topology</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '40px' }}>
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>FIG 1. Trend Lifecycle Analysis (Volume over Time)</h3>
              <div style={{ border: '1px solid #000', padding: '20px', backgroundColor: '#fafafa' }}>
                <TrendLifecycleChart q={q} />
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>FIG 2. Demographic and Linguistic Distribution</h3>
              <div style={{ border: '1px solid #000', padding: '20px', backgroundColor: '#fafafa' }}>
                <DemographicsView q={q} />
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>FIG 3. Social Interaction Topology</h3>
              <div style={{ border: '1px solid #000', padding: '20px', backgroundColor: '#fafafa' }}>
                <NetworkGraphView q={q} />
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>FIG 4. Hashtag Co-occurrence Matrix</h3>
              <div style={{ border: '1px solid #000', padding: '20px', backgroundColor: '#fafafa' }}>
                <HashtagCooccurrenceView q={q} />
              </div>
            </div>
          </div>
        </div>

        {/* Posts Feed */}
        <div style={{ marginBottom: '50px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>Extracted Corpus</h2>
            <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
              Sort Parameter: 
              <a href="?sort=time" style={{ marginLeft: '10px', color: sortParam === 'time' ? '#000' : '#666', textDecoration: sortParam === 'time' ? 'underline' : 'none', fontWeight: sortParam === 'time' ? 'bold' : 'normal' }}>Chronological</a>
              <span style={{ margin: '0 8px' }}>|</span>
              <a href="?sort=engagement" style={{ color: sortParam === 'engagement' ? '#000' : '#666', textDecoration: sortParam === 'engagement' ? 'underline' : 'none', fontWeight: sortParam === 'engagement' ? 'bold' : 'normal' }}>Engagement Level</a>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {posts.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', fontStyle: 'italic', border: '1px dashed #ccc' }}>No entries identified in the current context.</div>
            ) : (
              posts.map(p => (
                <div key={p.id} style={{ border: '1px solid #ccc', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fbfbfb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <span style={{ 
                        padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #000', textTransform: 'uppercase'
                      }}>
                        {p.platform}
                      </span>
                      {p.platform === 'reddit' && p.subreddit && (
                        <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>r/{p.subreddit}</span>
                      )}
                      <strong style={{ fontSize: '16px' }}>@{p.authorHandle || p.authorId}</strong>
                    </div>
                    <span style={{ color: '#555', fontSize: '14px', fontFamily: 'monospace' }}>
                      {new Date(p.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '16px', lineHeight: '1.6', color: '#000' }}>
                    {p.platform === 'reddit' && p.title && (
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '18px' }}>{p.title}</div>
                    )}
                    {p.text}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', gap: '20px', color: '#333', fontSize: '14px', fontFamily: 'monospace' }}>
                      {p.engagementStr.split(',').map((stat, i) => (
                        <span key={i}><strong>{stat.split(':')[0].trim().toUpperCase()}:</strong> {stat.split(':')[1]?.trim() || '-'}</span>
                      ))}
                    </div>
                    {p.trendLabel && (
                      <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#555' }}>Associated with: {p.trendLabel}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Authors Section */}
        <div style={{ marginBottom: '50px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', borderBottom: '2px solid #000', margin: '0 0 20px 0', paddingBottom: '10px', textTransform: 'uppercase' }}>Identified Author Entities</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* X Authors */}
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>TABLE 3: Entity Metadata (Platform X)</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', border: '1px solid #000' }}>
                <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #000' }}>
                  <tr>
                    <th style={{ padding: '8px 12px', borderRight: '1px solid #ccc' }}>Handle</th>
                    <th style={{ padding: '8px 12px', borderRight: '1px solid #ccc' }}>Follower Volume</th>
                    <th style={{ padding: '8px 12px', borderRight: '1px solid #ccc' }}>Verification Status</th>
                    <th style={{ padding: '8px 12px' }}>Stated Location</th>
                  </tr>
                </thead>
                <tbody>
                  {authors.filter(a => a.platform === 'x').length === 0 ? <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontStyle: 'italic' }}>No entities identified.</td></tr> : null}
                  {authors.filter(a => a.platform === 'x').map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #ccc' }}>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid #ccc', fontWeight: 'bold' }}>@{a.handle || a.authorId.substring(0, 8)}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{a.followerCount?.toLocaleString() || '-'}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{a.verified ? 'Verified' : 'Unverified'}</td>
                      <td style={{ padding: '8px 12px' }}>{a.location || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reddit Authors */}
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>TABLE 4: Entity Metadata (Platform Reddit)</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px', border: '1px solid #000' }}>
                <thead style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #000' }}>
                  <tr>
                    <th style={{ padding: '8px 12px', borderRight: '1px solid #ccc' }}>Username</th>
                    <th style={{ padding: '8px 12px', borderRight: '1px solid #ccc' }}>Link Karma</th>
                    <th style={{ padding: '8px 12px', borderRight: '1px solid #ccc' }}>Comment Karma</th>
                    <th style={{ padding: '8px 12px' }}>Account Standing</th>
                  </tr>
                </thead>
                <tbody>
                  {authors.filter(a => a.platform === 'reddit').length === 0 ? <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', fontStyle: 'italic' }}>No entities identified.</td></tr> : null}
                  {authors.filter(a => a.platform === 'reddit').map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #ccc' }}>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid #ccc', fontWeight: 'bold' }}>u/{a.handle || a.authorId}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{a.linkKarma?.toLocaleString() ?? '-'}</td>
                      <td style={{ padding: '8px 12px', borderRight: '1px solid #ccc', fontFamily: 'monospace' }}>{a.commentKarma?.toLocaleString() ?? '-'}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                        {a.isMod ? 'Moderator' : (a.isGold ? 'Premium' : 'Standard')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
