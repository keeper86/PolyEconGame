import { NextResponse } from 'next/server';
import { workerQueries } from '@/lib/workerQueries';

/**
 * Dev-only debug route that returns the raw worker snapshot for all planets.
 * Use this to verify what the server is returning (bypasses any client-side
 * transformations). Only enabled in development.
 */
export async function GET() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not available in non-development mode' }, { status: 403 });
    }

    try {
        const result = await workerQueries.getAllPlanets();
        if (process.env.SIM_DEBUG === '1') {
            try {
                console.debug('[api/debug/planets] returning planets:', JSON.parse(JSON.stringify(result)));
            } catch (_e) {
                // ignore
            }
        }
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
    }
}
