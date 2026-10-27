import { NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identifier =
    searchParams.get('trendId') ||
    searchParams.get('trendLabel') ||
    searchParams.get('snapshotId');

  if (!identifier) {
    return NextResponse.json(
      {
        error:
          'Missing query parameter: trendId, snapshotId, or trendLabel',
        example: '/api/integrity/verify?trendId=1042',
      },
      { status: 400 }
    );
  }

  // 1. Try Live Microservice first if available
  const microservicePort = process.env.INTEGRITY_API_PORT || '5050';
  const microserviceUrl = `http://127.0.0.1:${microservicePort}/api/integrity/verify?${searchParams.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const msRes = await fetch(microserviceUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (msRes.ok) {
      const data = await msRes.json();
      return NextResponse.json(data);
    }
  } catch (e) {
    // Microservice offline or timed out -> proceed with direct DB fallback
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { error: 'DATABASE_URL not configured' },
      { status: 500 }
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    const isNumeric = !isNaN(Number(identifier));
    const anchorQuery = isNumeric
      ? `SELECT * FROM blockchain_anchors WHERE snapshot_id = $1 ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM blockchain_anchors WHERE trend_label = $1 ORDER BY created_at DESC LIMIT 1`;

    const res = await client.query(anchorQuery, [
      isNumeric ? Number(identifier) : String(identifier),
    ]);

    if (res.rows.length === 0) {
      return NextResponse.json({
        verified: false,
        status: 'NOT_ANCHORED',
        message: `No blockchain anchor record found for '${identifier}'. This trend may still be pending batching.`,
        identifier,
      });
    }

    const anchor = res.rows[0];
    const txHash = anchor.tx_hash;
    const polygonScanUrl = txHash
      ? `https://amoy.polygonscan.com/tx/${txHash}`
      : null;

    return NextResponse.json({
      verified: anchor.status === 'confirmed',
      status: anchor.status === 'confirmed' ? 'INTACT' : 'TAMPER_DETECTED',
      trendLabel: anchor.trend_label,
      snapshotId: anchor.snapshot_id,
      badge: {
        label:
          anchor.status === 'confirmed'
            ? 'Verified on Polygon'
            : 'Tamper Detected',
        variant: anchor.status === 'confirmed' ? 'success' : 'danger',
        polygonScanUrl,
        txHash,
        blockNumber: anchor.block_number ? Number(anchor.block_number) : null,
        anchoredAt: anchor.captured_at,
        merkleRoot: anchor.merkle_root,
      },
      tamperedFields: [],
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
