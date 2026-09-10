import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const edges = await prisma.edge.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });

        const nodeMap: Record<string, { id: string; edgeCount: number; isTarget: boolean }> = {};
        for (const edge of edges) {
            if (!nodeMap[edge.sourceAuthor]) nodeMap[edge.sourceAuthor] = { id: edge.sourceAuthor, edgeCount: 0, isTarget: false };
            if (!nodeMap[edge.targetAuthor]) nodeMap[edge.targetAuthor] = { id: edge.targetAuthor, edgeCount: 0, isTarget: false };
            nodeMap[edge.sourceAuthor].edgeCount++;
            nodeMap[edge.targetAuthor].edgeCount++;
            nodeMap[edge.targetAuthor].isTarget = true;
        }

        const nodes = Object.values(nodeMap)
            .map(n => ({ ...n, pageRank: n.isTarget ? n.edgeCount : 0 }))
            .sort((a, b) => b.pageRank - a.pageRank);

        const edgeTypes: Record<string, number> = {};
        const trendEdges: Record<string, number> = {};
        for (const edge of edges) {
            edgeTypes[edge.edgeType] = (edgeTypes[edge.edgeType] || 0) + 1;
            if (edge.trendLabel) trendEdges[edge.trendLabel] = (trendEdges[edge.trendLabel] || 0) + 1;
        }

        return NextResponse.json({
            nodes,
            edges: edges.map(e => ({ source: e.sourceAuthor, target: e.targetAuthor, type: e.edgeType, trend: e.trendLabel })),
            stats: {
                totalNodes: nodes.length,
                totalEdges: edges.length,
                edgeTypes,
                trendEdges,
                topKOLs: nodes.slice(0, 10)
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
