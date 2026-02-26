'use client';

import { useEffect, useState } from 'react';

export default function SecondTicker() {
    const [tick, setTick] = useState<number | null>(null);

    useEffect(() => {
        const es = new EventSource('/api/tick');

        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg?.type === 'tick') {
                    setTick(msg.tick);
                }
            } catch (_err) {
                // ignore parse errors
            }
        };

        es.onerror = () => {
            // Close on errors; client can retry by re-mounting.
            es.close();
        };

        return () => {
            es.close();
        };
    }, []);

    return (
        <div className='rounded border p-2 inline-block bg-white/5'>
            <div className='text-sm text-slate-400'>Server tick</div>
            <div className='text-xl font-mono'>{tick ?? '—'}</div>
        </div>
    );
}
