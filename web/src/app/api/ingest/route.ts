import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const SCRAPER_API_URL = 'http://localhost:8000';

const REGION_MAP: Record<string, string> = {
    "india": "India", "mumbai": "Maharashtra", "pune": "Maharashtra", "nagpur": "Maharashtra", "maharashtra": "Maharashtra",
    "delhi": "Delhi", "new delhi": "Delhi", "ncr": "Delhi",
    "bangalore": "Karnataka", "bengaluru": "Karnataka", "karnataka": "Karnataka", "mysore": "Karnataka",
    "hyderabad": "Telangana", "telangana": "Telangana",
    "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "tamil nadu": "Tamil Nadu",
    "kolkata": "West Bengal", "west bengal": "West Bengal",
    "ahmedabad": "Gujarat", "surat": "Gujarat", "gujarat": "Gujarat",
    "jaipur": "Rajasthan", "rajasthan": "Rajasthan",
    "lucknow": "Uttar Pradesh", "kanpur": "Uttar Pradesh", "noida": "Uttar Pradesh", "up": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh",
    "chandigarh": "Punjab/Haryana", "punjab": "Punjab/Haryana", "haryana": "Punjab/Haryana", "gurgaon": "Punjab/Haryana",
    "bhopal": "Madhya Pradesh", "indore": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh",
    "patna": "Bihar", "bihar": "Bihar",
    "kerala": "Kerala", "kochi": "Kerala", "trivandrum": "Kerala",
    "andhra pradesh": "Andhra Pradesh", "vizag": "Andhra Pradesh"
};

function parseRegionLocally(location: string | null | undefined): string {
    if (!location) return "Other";
    const locLower = location.toLowerCase().trim();
    for (const [key, val] of Object.entries(REGION_MAP)) {
        if (locLower.includes(key)) return val;
    }
    return "Other";
}

export async function POST(req: Request) {
    try {
        let targetTrendLabel: string | null = null;
        try {
            const body = await req.json();
            if (body.targetTrendLabel) targetTrendLabel = body.targetTrendLabel;
        } catch(e) {}

        const batchId = crypto.randomUUID();
        console.log(`[Pipeline ${batchId}] Starting... Target: ${targetTrendLabel || 'None'}`);

        if (targetTrendLabel) {
            await prisma.post.deleteMany({ where: { trendLabel: targetTrendLabel } });
            await prisma.edge.deleteMany({ where: { trendLabel: targetTrendLabel } });
        }

        let trendsData: any[] = [];
        try {
            const trendRes = await fetch(`${SCRAPER_API_URL}/scrape/x/trends`);
            if (trendRes.ok) {
                const json = await trendRes.json();
                trendsData = (json.data || []).slice(0, 10); // Fetch top 10 trends for rolling updates
            }
        } catch (e) { console.error("Failed to fetch X trends", e); }

        const trendDbIds: Record<string, string> = {};
        for (const trend of trendsData) {
            let previousTrend = await prisma.trend.findFirst({ where: { label: trend.label }, orderBy: { fetchedAt: 'desc' } });
            const totalEng = previousTrend?.totalEngagement || 0;
            const tCount = previousTrend?.tweetCount || 0;

            const created = await prisma.trend.create({
                data: { platform: trend.platform, label: trend.label, volume: trend.volume, rank: trend.rank, batchId, tweetCount: tCount, totalEngagement: totalEng }
            });
            trendDbIds[trend.label] = created.id;
        }

        let trendKeywords = trendsData.map((t: any) => ({ original: t.label, search: t.label.replace('#', '') }));
        if (targetTrendLabel) {
            trendKeywords = trendKeywords.filter(kw => kw.original === targetTrendLabel);
            if (trendKeywords.length === 0) {
                return NextResponse.json({ success: false, message: `Trend ${targetTrendLabel} not found in top 10` });
            }
        } else {
            return NextResponse.json({ success: true, message: 'Updated Top 10 trends list without deep scraping.', batchId });
        }

        const allAuthorsToFetch = new Set<string>();
        const tweetCountPerTrend: Record<string, number> = {};
        const engagementPerTrend: Record<string, number> = {};
        const tweetsTextPerTrend: Record<string, string[]> = {};
        const allEdges: { source: string; target: string; platform: string; type: string; trend: string }[] = [];
        const allHashtagSets: string[][] = [];

        for (const kw of trendKeywords) {
            const trendLabel = kw.original;
            let count = 0, totalEng = 0;
            tweetsTextPerTrend[trendLabel] = [];
            const MIN_ENGAGEMENT_THRESHOLD = 10;

            try {
                const tweetRes = await fetch(`${SCRAPER_API_URL}/scrape/x/tweets?keyword=${encodeURIComponent(kw.search)}&count=30`);
                if (tweetRes.ok) {
                    const json = await tweetRes.json();
                    for (const post of (json.data || [])) {
                        const handle = post.authorHandle || null;
                        const hashtags = post.hashtags || [];
                        const engagement = post.engagement || {};
                        const engTotal = (engagement.likes || 0) + (engagement.retweets || 0) + (engagement.replies || 0);

                        const region = parseRegionLocally(post.authorLocation);
                        if (region === "Other") continue;

                        if (engTotal < MIN_ENGAGEMENT_THRESHOLD) continue;

                        await prisma.post.upsert({
                            where: { postId: post.postId }, update: {},
                            create: {
                                id: `x_${post.postId}`, platform: post.platform, postId: post.postId,
                                authorId: post.authorId, text: post.text, timestamp: new Date(post.timestamp),
                                language: post.language, detectedLang: post.detectedLang,
                                engagement: JSON.stringify(engagement), replyToId: post.replyToId,
                                replyToAuthorId: post.replyToAuthorId, forwardFromId: post.forwardFromId,
                                hashtags: JSON.stringify(hashtags), sourceLayer: post.sourceLayer,
                                authorHandle: handle, trendLabel
                            }
                        });
                        count++; totalEng += engTotal;
                        tweetsTextPerTrend[trendLabel].push(post.text || "");
                        if (post.replyToAuthorId && handle) allEdges.push({ source: handle, target: post.replyToAuthorId, platform: 'x', type: 'reply', trend: trendLabel });
                        if (post.forwardFromId && handle) allEdges.push({ source: handle, target: post.forwardFromId, platform: 'x', type: 'retweet', trend: trendLabel });
                        if (hashtags.length >= 2) allHashtagSets.push(hashtags);
                        if (handle) allAuthorsToFetch.add(`x:${handle}`);
                    }
                }
            } catch (e) { console.error(`X search failed for "${kw.search}"`, e); }

            try {
                const redditRes = await fetch(`${SCRAPER_API_URL}/scrape/reddit/search?keyword=${encodeURIComponent(kw.search)}&limit=20`);
                if (redditRes.ok) {
                    const json = await redditRes.json();
                    for (const post of (json.data || [])) {
                        const handle = post.authorHandle || post.authorId || null;
                        const hashtags = post.hashtags || [];
                        const engagement = post.engagement || {};
                        const engTotal = (engagement.upvotes || engagement.score || 0) + (engagement.comments || 0);

                        if (engTotal < MIN_ENGAGEMENT_THRESHOLD) continue;

                        await prisma.post.upsert({
                            where: { postId: post.postId }, update: {},
                            create: {
                                id: `red_${post.postId}`, platform: post.platform, postId: post.postId,
                                authorId: post.authorId, text: post.text, timestamp: new Date(post.timestamp),
                                language: post.language, detectedLang: post.detectedLang,
                                engagement: JSON.stringify(engagement), replyToId: post.replyToId,
                                replyToAuthorId: post.replyToAuthorId, forwardFromId: post.forwardFromId,
                                hashtags: JSON.stringify(hashtags), sourceLayer: post.sourceLayer,
                                authorHandle: handle, trendLabel
                            }
                        });
                        count++; totalEng += engTotal;
                        tweetsTextPerTrend[trendLabel].push(post.text || "");
                        if (hashtags.length >= 2) allHashtagSets.push(hashtags);
                        if (handle) allAuthorsToFetch.add(`reddit:${handle}`);
                    }
                }
            } catch (e) { console.error(`Reddit search failed for "${kw.search}"`, e); }

            tweetCountPerTrend[trendLabel] = count;
            engagementPerTrend[trendLabel] = totalEng;
        }

        for (const [label, count] of Object.entries(tweetCountPerTrend)) {
            const dbId = trendDbIds[label];
            if (!dbId) continue;
            let category = 'Other';
            try {
                const classifyRes = await fetch(`${SCRAPER_API_URL}/process/classify-trend`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label, tweets_text: tweetsTextPerTrend[label] || [] })
                });
                if (classifyRes.ok) { const cj = await classifyRes.json(); category = cj.category || 'Other'; }
            } catch (e) {}
            await prisma.trend.update({ where: { id: dbId }, data: { tweetCount: count, totalEngagement: engagementPerTrend[label] || 0, category } });
        }

        for (const edge of allEdges) {
            try { await prisma.edge.create({ data: { sourceAuthor: edge.source, targetAuthor: edge.target, platform: edge.platform, edgeType: edge.type, trendLabel: edge.trend, batchId } }); } catch (e) {}
        }

        for (const tags of allHashtagSets) {
            const uniqueTags = [...new Set(tags.map((t: string) => t.toLowerCase()))];
            for (let i = 0; i < uniqueTags.length; i++) {
                for (let j = i + 1; j < uniqueTags.length; j++) {
                    const [tagA, tagB] = [uniqueTags[i], uniqueTags[j]].sort();
                    try { await prisma.hashtagPair.upsert({ where: { tagA_tagB_batchId: { tagA, tagB, batchId } }, update: { count: { increment: 1 } }, create: { tagA, tagB, batchId, count: 1 } }); } catch (e) {}
                }
            }
        }

        const authorsList = Array.from(allAuthorsToFetch).slice(0, 100); // Fetch up to 100 authors per run
        for (const authorMeta of authorsList) {
            const [platform, handle] = authorMeta.split(':');
            try {
                const authorRes = await fetch(`${SCRAPER_API_URL}/scrape/${platform}/author?handle=${encodeURIComponent(handle)}`);
                if (authorRes.ok) {
                    const json = await authorRes.json();
                    if (json.data) {
                        await prisma.author.upsert({
                            where: { authorId: json.data.authorId },
                            update: { handle: json.data.handle, bio: json.data.bio, location: json.data.location, region: json.data.region, profession: json.data.profession, followerCount: json.data.followerCount, verified: json.data.verified },
                            create: {
                                id: `${platform}_${json.data.authorId}`, platform: json.data.platform, authorId: json.data.authorId, handle: json.data.handle,
                                bio: json.data.bio, location: json.data.location, region: json.data.region, profession: json.data.profession,
                                followerCount: json.data.followerCount, verified: json.data.verified,
                                accountAge: json.data.accountAge ? new Date(json.data.accountAge) : null
                            }
                        });
                    }
                }
            } catch (e) { console.error(`Author fetch failed for @${handle}`, e); }
        }

        const snapshotCount = await prisma.trend.groupBy({ by: ['batchId'] });
        const edgeCount = await prisma.edge.count({ where: { batchId } });
        const pairCount = await prisma.hashtagPair.count({ where: { batchId } });

        return NextResponse.json({
            success: true, message: 'Ingestion pipeline run complete.',
            batchId, totalSnapshots: snapshotCount.length,
            tweetCountPerTrend, edgesCreated: edgeCount, hashtagPairs: pairCount
        });
    } catch (error: any) {
        console.error("Pipeline error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
