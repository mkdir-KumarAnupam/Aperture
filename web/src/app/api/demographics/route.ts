import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get('q');
        
        const authors = await prisma.author.findMany({
            where: q ? { OR: [{ handle: { contains: q } }, { bio: { contains: q } }, { authorId: { contains: q } }] } : {}
        });
        const posts = await prisma.post.findMany({ 
            where: q ? { text: { contains: q } } : {},
            select: { detectedLang: true, trendLabel: true } 
        });

        const regionDist: Record<string, number> = {};
        for (const a of authors) { 
            const r = a.region || 'Unknown'; 
            regionDist[r] = (regionDist[r] || 0) + 1; 
        }

        const profDist: Record<string, number> = {};
        for (const a of authors) { 
            const p = (a as any).profession || 'Unknown'; 
            profDist[p] = (profDist[p] || 0) + 1; 
        }

        const langDist: Record<string, number> = {};
        for (const p of posts) { 
            const l = p.detectedLang || 'unknown'; 
            langDist[l] = (langDist[l] || 0) + 1; 
        }

        const langPerTrend: Record<string, Record<string, number>> = {};
        for (const p of posts) { 
            if (!p.trendLabel) continue; 
            if (!langPerTrend[p.trendLabel]) langPerTrend[p.trendLabel] = {}; 
            const l = p.detectedLang || 'unknown'; 
            langPerTrend[p.trendLabel][l] = (langPerTrend[p.trendLabel][l] || 0) + 1; 
        }

        const now = new Date();
        const ageBuckets: Record<string, number> = { '< 6 months': 0, '6m - 1y': 0, '1y - 3y': 0, '3y - 5y': 0, '> 5y': 0 };
        for (const a of authors) {
            if (!a.accountAge) continue;
            const ageYears = (now.getTime() - new Date(a.accountAge).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            if (ageYears < 0.5) ageBuckets['< 6 months']++;
            else if (ageYears < 1) ageBuckets['6m - 1y']++;
            else if (ageYears < 3) ageBuckets['1y - 3y']++;
            else if (ageYears < 5) ageBuckets['3y - 5y']++;
            else ageBuckets['> 5y']++;
        }

        return NextResponse.json({ 
            regionDistribution: Object.entries(regionDist).sort((a, b) => b[1] - a[1]), 
            professionDistribution: Object.entries(profDist).sort((a, b) => b[1] - a[1]), 
            languageDistribution: Object.entries(langDist).sort((a, b) => b[1] - a[1]), 
            languagePerTrend: langPerTrend, 
            accountAgeBuckets: ageBuckets, 
            totalAuthors: authors.length, 
            totalPosts: posts.length 
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
