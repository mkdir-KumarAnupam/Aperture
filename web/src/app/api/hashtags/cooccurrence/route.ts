import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get('q');
        
        const pairs = await prisma.hashtagPair.findMany({ 
            where: q ? { OR: [{ tagA: { contains: q } }, { tagB: { contains: q } }] } : {},
            orderBy: { count: 'desc' }, 
            take: 50 
        });

        const tagSet = new Set<string>();
        for (const p of pairs) { 
            tagSet.add(p.tagA); 
            tagSet.add(p.tagB); 
        }

        return NextResponse.json({ 
            pairs: pairs.map(p => ({ tagA: p.tagA, tagB: p.tagB, count: p.count })), 
            uniqueTags: Array.from(tagSet), 
            totalPairs: pairs.length 
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
