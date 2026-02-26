'use client';
import React, { useState } from 'react';

type Planet = { id: string; name: string };

export default function TransportForm({
    planets,
    onCreate,
}: {
    planets: Planet[];
    onCreate: (from: string, to: string, metal: number, energy: number, eta: number) => void;
}) {
    const [from, setFrom] = useState<string>(planets[0]?.id ?? '');
    const [to, setTo] = useState<string>(planets[1]?.id ?? '');
    const [metal, setMetal] = useState<number>(10);
    const [energy, setEnergy] = useState<number>(0);
    const [eta, setEta] = useState<number>(5);

    // Update defaults when planets change
    React.useEffect(() => {
        if (!from && planets[0]) {
            setFrom(planets[0].id);
        }
        if (!to && planets[1]) {
            setTo(planets[1].id);
        }
    }, [planets, from, to]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!from || !to) {
            return;
        }
        onCreate(from, to, Number(metal), Number(energy), Number(eta));
    };

    return (
        <form onSubmit={submit} className='space-y-3'>
            <div>
                <label className='block text-sm'>From</label>
                <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className='w-full mt-1 p-2 border rounded'
                >
                    {planets.map((p) => (
                        <option value={p.id} key={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className='block text-sm'>To</label>
                <select value={to} onChange={(e) => setTo(e.target.value)} className='w-full mt-1 p-2 border rounded'>
                    {planets.map((p) => (
                        <option value={p.id} key={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className='block text-sm'>Metal</label>
                <input
                    type='number'
                    value={metal}
                    onChange={(e) => setMetal(Number(e.target.value))}
                    className='w-full mt-1 p-2 border rounded'
                />
            </div>

            <div>
                <label className='block text-sm'>Energy</label>
                <input
                    type='number'
                    value={energy}
                    onChange={(e) => setEnergy(Number(e.target.value))}
                    className='w-full mt-1 p-2 border rounded'
                />
            </div>

            <div>
                <label className='block text-sm'>ETA (ticks)</label>
                <input
                    type='number'
                    value={eta}
                    onChange={(e) => setEta(Number(e.target.value))}
                    className='w-full mt-1 p-2 border rounded'
                />
            </div>

            <div>
                <button type='submit' className='px-3 py-2 bg-blue-600 text-white rounded'>
                    Create Ship
                </button>
            </div>
        </form>
    );
}
