'use client';

export default function TickDisplay({ tick }: { tick: number }) {
    return (
        <div className='rounded border p-2 inline-block bg-white/5'>
            <div className='text-sm text-slate-400'>Server tick</div>
            <div className='text-xl font-mono'>{tick > 0 ? tick : '—'}</div>
        </div>
    );
}
