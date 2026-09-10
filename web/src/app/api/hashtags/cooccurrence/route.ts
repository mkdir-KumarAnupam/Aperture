import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const pairs = await prisma.hashtagPair.findMany({ 
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
