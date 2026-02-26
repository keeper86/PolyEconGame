'use client';

import { useState } from 'react';

export default function DevWorkerHotReload() {
    const [running, setRunning] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    async function handleRestart() {
        setRunning(true);
        setMsg(null);
        try {
            const res = await fetch('/api/simulation/restart', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data?.ok) {
                setMsg('Worker restarted');
            } else {
                setMsg('Restart failed: ' + (data?.error ?? res.statusText));
            }
        } catch (err) {
            setMsg('Error: ' + String(err));
        } finally {
            setRunning(false);
            // clear after a short timeout
            setTimeout(() => setMsg(null), 4000);
        }
    }

    return (
        <div className='flex items-center gap-2'>
            <button
                type='button'
                onClick={handleRestart}
                disabled={running}
                title='Restart simulation worker (dev only)'
                className='rounded-md border px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50'
            >
                {running ? 'Restarting…' : 'Restart Worker'}
            </button>
            {msg ? <span className='text-xs text-zinc-600'>{msg}</span> : null}
        </div>
    );
}
