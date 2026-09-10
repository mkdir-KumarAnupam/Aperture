import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get('q');
        
        const allTrends = await prisma.trend.findMany({
            where: q ? { label: { contains: q } } : {},
            orderBy: { fetchedAt: 'asc' },
            select: {
                label: true,
                rank: true,
                volume: true,
                tweetCount: true,
                batchId: true,
                fetchedAt: true
            }
        });

        const latestBatch = await prisma.trend.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { batchId: true } });
        let topLabels: string[] = [];
        if (latestBatch) {
            const latestTrends = await prisma.trend.findMany({ where: { batchId: latestBatch.batchId } });
            latestTrends.sort((a, b) => (b.totalEngagement || 0) - (a.totalEngagement || 0));
            topLabels = latestTrends.slice(0, 8).map(t => t.label);
        }

        const batches: { batchId: string; fetchedAt: Date }[] = [];
        const seenBatches = new Set<string>();
        for (const t of allTrends) {
            if (!seenBatches.has(t.batchId)) {
                seenBatches.add(t.batchId);
                batches.push({ batchId: t.batchId, fetchedAt: t.fetchedAt });
            }
        }

        const series: Record<string, { timestamp: string; score: number; rank: number | null; tweetCount: number | null }[]> = {};

        for (const label of topLabels) {
            series[label] = batches.map(batch => {
                const match = allTrends.find(t => t.label === label && t.batchId === batch.batchId);
                const rank = match?.rank ?? null;
                const score = rank ? Math.round((16 - rank) * 6.67) : 0;
                return {
                    timestamp: batch.fetchedAt.toISOString(),
                    score,
                    rank,
                    tweetCount: match?.tweetCount ?? null
                };
            });
        }

        const phases: Record<string, string> = {};
        for (const label of topLabels) {
            const scores = series[label].map(s => s.score);
            if (scores.length < 2) {
                phases[label] = 'new';
                continue;
            }
            const last3 = scores.slice(-3);
            if (last3.length >= 2 && last3[last3.length - 1] > last3[0]) {
                phases[label] = 'rising';
            } else if (last3.length >= 2 && last3[last3.length - 1] < last3[0]) {
                phases[label] = 'decaying';
            } else {
                phases[label] = 'peaking';
            }
        }

        return NextResponse.json({
            labels: topLabels,
            timestamps: batches.map(b => b.fetchedAt.toISOString()),
            series,
            phases,
            totalSnapshots: batches.length
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
