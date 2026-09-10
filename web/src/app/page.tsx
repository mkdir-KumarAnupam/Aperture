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

  const latestBatch = await prisma.trend.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { batchId: true } });
  let trends = latestBatch 
    ? await prisma.trend.findMany({ where: { batchId: latestBatch.batchId } })
    : [];

  trends.sort((a, b) => (b.totalEngagement || 0) - (a.totalEngagement || 0));
  const rawPosts = await prisma.post.findMany({ orderBy: { timestamp: 'desc' }, take: 50 });
  const authors = await prisma.author.findMany({ orderBy: { lastFetched: 'desc' }, take: 15 });

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
        const up = eng.upvotes || eng.score || 0;
        const comm = eng.comments || 0;
        totalEngagement = up + comm;
        engagementStr = `upvotes: ${up}, comments: ${comm}`;
      }
    } catch (e) {}

    return { ...p, engagementStr, totalEngagement };
  });

  if (sortParam === 'engagement') {
    posts.sort((a, b) => b.totalEngagement - a.totalEngagement);
  }

  const trendLabelsWithPosts = [...new Set(posts.map(p => p.trendLabel).filter(Boolean))];

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', color: '#000', backgroundColor: '#fff', maxWidth: '1200px', margin: '0 auto' }}>

      <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', display: 'inline-block', margin: '0 0 10px 0' }}>1. Trends (Latest Snapshot)</h2>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '40px', border: '2px solid #000' }}>
        <thead style={{ backgroundColor: '#ddd' }}>
          <tr>
            <th>X API Rank</th>
            <th>Label</th>
            <th>Platform</th>
            <th>Volume (API)</th>
            <th>Total Engagement</th>
            <th>Fetched At</th>
          </tr>
        </thead>
        <tbody>
          {trends.length === 0 ? <tr><td colSpan={6}>Empty</td></tr> : null}
          {trends.map(t => (
            <tr key={t.id} style={{ backgroundColor: t.totalEngagement && t.totalEngagement > 0 ? '#f0fff0' : 'transparent' }}>
              <td><strong>{t.rank ? `#${t.rank}` : 'N/A'}</strong></td>
              <td><strong>{t.label}</strong></td>
              <td>{t.platform}</td>
              <td>{t.volume || '-'}</td>
              <td style={{ fontWeight: 'bold', color: t.totalEngagement && t.totalEngagement > 0 ? '#006600' : '#999' }}>
                {t.totalEngagement ?? '-'}
              </td>
              <td style={{ fontSize: '12px' }}>{t.fetchedAt.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', display: 'inline-block', margin: '0 0 10px 0' }}>1b. Trend Lifecycle</h2>
      <TrendLifecycleChart />

      <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', display: 'inline-block', margin: '20px 0 10px 0' }}>1c. Demographics & Author Insights</h2>
      <DemographicsView />

      <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', display: 'inline-block', margin: '20px 0 10px 0' }}>1d. Network Topology (KOLs)</h2>
      <NetworkGraphView />

      <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', display: 'inline-block', margin: '20px 0 10px 0' }}>1e. Hashtag Co-occurrence Matrix</h2>
      <HashtagCooccurrenceView />

      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
        <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', margin: 0 }}>2. Posts by Trend</h2>
        <div>
          Sort by: 
          {sortParam === 'time' ? (
            <strong style={{ marginLeft: '5px', backgroundColor: '#ff0' }}>Time</strong>
          ) : (
            <a href="/?sort=time" style={{ marginLeft: '5px', color: '#0000ee' }}>Time</a>
          )}
          {' | '}
          {sortParam === 'engagement' ? (
            <strong style={{ backgroundColor: '#ff0' }}>Engagement</strong>
          ) : (
            <a href="/?sort=engagement" style={{ color: '#0000ee' }}>Engagement</a>
          )}
        </div>
      </div>
      
      {trendLabelsWithPosts.length === 0 && posts.length === 0 ? (
        <div style={{ padding: '15px', border: '1px solid #ccc', marginBottom: '40px' }}>Empty</div>
      ) : null}

      {/* Posts grouped by trend */}
      {trendLabelsWithPosts.map(trendLabel => {
        const trendPosts = posts.filter(p => p.trendLabel === trendLabel);
        if (trendPosts.length === 0) return null;
        return (
          <div key={trendLabel} style={{ marginBottom: '30px' }}>
            <div style={{ backgroundColor: '#eee', padding: '8px', border: '1px solid #000', marginBottom: '5px' }}>
              <strong>Trend: {trendLabel}</strong> — {trendPosts.length} posts found
            </div>
            <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', border: '2px solid #000' }}>
              <thead style={{ backgroundColor: '#ddd' }}>
                <tr>
                  <th>Platform</th>
                  <th>Author</th>
                  <th>Content</th>
                  <th>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {trendPosts.map(p => (
                  <tr key={p.id}>
                    <td>{p.platform}</td>
                    <td>{p.authorHandle || p.authorId}</td>
                    <td style={{ maxWidth: '450px' }}>{p.text}</td>
                    <td style={{ color: '#d10000', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{p.engagementStr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Posts without a trend label (if any) */}
      {posts.filter(p => !p.trendLabel).length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <div style={{ backgroundColor: '#eee', padding: '8px', border: '1px solid #000', marginBottom: '5px' }}>
            <strong>Other Posts (no trend tag)</strong>
          </div>
          <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', border: '2px solid #000' }}>
            <thead style={{ backgroundColor: '#ddd' }}>
              <tr>
                <th>Platform</th>
                <th>Author</th>
                <th>Content</th>
                <th>Engagement</th>
              </tr>
            </thead>
            <tbody>
              {posts.filter(p => !p.trendLabel).map(p => (
                <tr key={p.id}>
                  <td>{p.platform}</td>
                  <td>{p.authorHandle || p.authorId}</td>
                  <td style={{ maxWidth: '450px' }}>{p.text}</td>
                  <td style={{ color: '#d10000', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{p.engagementStr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ backgroundColor: '#000', color: '#fff', padding: '5px', display: 'inline-block', margin: '0 0 10px 0' }}>3. Authors</h2>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%', border: '2px solid #000' }}>
        <thead style={{ backgroundColor: '#ddd' }}>
          <tr>
            <th>Platform</th>
            <th>Handle</th>
            <th>Author ID</th>
            <th>Followers</th>
            <th>Verified</th>
            <th>Last Fetched</th>
          </tr>
        </thead>
        <tbody>
          {authors.length === 0 ? <tr><td colSpan={6}>Empty</td></tr> : null}
          {authors.map(a => (
            <tr key={a.id}>
              <td>{a.platform}</td>
              <td><strong>{a.handle || 'N/A'}</strong></td>
              <td>{a.authorId}</td>
              <td>{a.followerCount}</td>
              <td>{a.verified ? 'Yes' : 'No'}</td>
              <td style={{ fontSize: '12px' }}>{a.lastFetched.toString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}
