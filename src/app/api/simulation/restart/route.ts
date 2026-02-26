import { NextResponse } from 'next/server';
import { restartWorker } from '@/simulation/workerManager';

// Only allow this route in development mode.
export async function POST() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        await restartWorker();
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[api/simulation/restart] Restart failed:', err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
