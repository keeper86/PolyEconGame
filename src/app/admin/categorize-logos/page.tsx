'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';

interface GeminiImage {
    filename: string;
    url: string;
}

interface Bucket {
    id: string;
    label: string;
    imageFilenames: string[];
}

export default function CategorizeLogosPage() {
    const [sourceImages, setSourceImages] = useState<GeminiImage[]>([]);
    const [allImages, setAllImages] = useState<GeminiImage[]>([]);
    const [buckets, setBuckets] = useState<Bucket[]>([
        { id: 'raw', label: 'Raw', imageFilenames: [] },
        { id: 'refinement', label: 'Refinement', imageFilenames: [] },
        { id: 'manufacturing', label: 'Manufacturing', imageFilenames: [] },
        { id: 'services', label: 'Services', imageFilenames: [] },
        { id: 'general', label: 'General', imageFilenames: [] },
    ]);
    const [existingCounts, setExistingCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<{ moved?: number; errors?: string[]; error?: string } | null>(null);
    const [dragItem, setDragItem] = useState<{ type: 'source' | 'bucket'; bucketId?: string; filename: string } | null>(
        null,
    );

    useEffect(() => {
        fetch('/api/admin/categorize-logos')
            .then((r) => r.json())
            .then((data) => {
                setAllImages(data.images);
                setSourceImages(data.images);
                setExistingCounts(data.existingCategoryCounts ?? {});
            })
            .catch((e) => setResult({ error: String(e) }))
            .finally(() => setLoading(false));
    }, []);

    const getImageUrl = useCallback(
        (filename: string) => {
            const img = allImages.find((i) => i.filename === filename);
            return img?.url ?? `/${filename}`;
        },
        [allImages],
    );

    const handleDragStart = (type: 'source' | 'bucket', bucketId: string | undefined, filename: string) => {
        setDragItem({ type, bucketId, filename });
    };

    const handleDropOnBucket = (bucketId: string) => {
        if (!dragItem) {
            return;
        }

        if (dragItem.type === 'source') {
            // Move from source to bucket
            setSourceImages((prev) => prev.filter((i) => i.filename !== dragItem.filename));
            setBuckets((prev) =>
                prev.map((b) =>
                    b.id === bucketId ? { ...b, imageFilenames: [...b.imageFilenames, dragItem.filename] } : b,
                ),
            );
        } else if (dragItem.type === 'bucket' && dragItem.bucketId !== bucketId) {
            // Move between buckets
            setBuckets((prev) =>
                prev.map((b) => {
                    if (b.id === dragItem.bucketId) {
                        return { ...b, imageFilenames: b.imageFilenames.filter((f) => f !== dragItem.filename) };
                    }
                    if (b.id === bucketId) {
                        return { ...b, imageFilenames: [...b.imageFilenames, dragItem.filename] };
                    }
                    return b;
                }),
            );
        }

        setDragItem(null);
    };

    const handleDropBackToSource = (filename: string) => {
        if (!dragItem) {
            return;
        }
        if (dragItem.type !== 'bucket' || !dragItem.bucketId) {
            return;
        }

        // Do not add duplicate
        if (sourceImages.some((i) => i.filename === filename)) {
            return;
        }

        setBuckets((prev) =>
            prev.map((b) =>
                b.id === dragItem.bucketId
                    ? { ...b, imageFilenames: b.imageFilenames.filter((f) => f !== filename) }
                    : b,
            ),
        );
        const img = allImages.find((i) => i.filename === filename);
        if (img) {
            setSourceImages((prev) => [...prev, img]);
        }
        setDragItem(null);
    };

    const addBucket = () => {
        const id = `custom_${Date.now()}`;
        setBuckets((prev) => [...prev, { id, label: `Category ${prev.length + 1}`, imageFilenames: [] }]);
    };

    const removeBucket = (bucketId: string) => {
        const bucket = buckets.find((b) => b.id === bucketId);
        if (!bucket) {
            return;
        }
        // Return images to source
        const returned = bucket.imageFilenames
            .map((f) => allImages.find((i) => i.filename === f))
            .filter(Boolean) as GeminiImage[];
        setSourceImages((prev) => [...prev, ...returned]);
        setBuckets((prev) => prev.filter((b) => b.id !== bucketId));
    };

    const updateBucketLabel = (bucketId: string, label: string) => {
        setBuckets((prev) => prev.map((b) => (b.id === bucketId ? { ...b, label } : b)));
    };

    const handleSave = async () => {
        setSaving(true);
        setResult(null);

        const mappings: Record<string, string> = {};
        for (const bucket of buckets) {
            if (!bucket.label.trim()) {
                continue;
            }
            for (const filename of bucket.imageFilenames) {
                mappings[filename] = bucket.label.trim();
            }
        }

        const categories = buckets.map((b) => b.label.trim()).filter(Boolean);

        try {
            const res = await fetch('/api/admin/categorize-logos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings, categories }),
            });
            const data = await res.json();
            setResult(data);
            if (data.moved) {
                setSourceImages([]);
                setBuckets(buckets.map((b) => ({ ...b, imageFilenames: [] })));
            }
        } catch (e) {
            setResult({ error: String(e) });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className='flex items-center justify-center min-h-screen bg-background'>
                <p className='text-lg text-muted-foreground'>Loading images...</p>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-background p-6'>
            <h1 className='text-2xl font-bold mb-2'>Categorize Company Logos</h1>
            <p className='text-sm text-muted-foreground mb-6'>
                Drag images from the source area into category buckets. Editable bucket labels become the category name
                in the filename.
            </p>

            {/* Source area */}
            <div className='mb-8'>
                <h2 className='text-lg font-semibold mb-2'>Unassigned Images ({sourceImages.length})</h2>
                <div
                    className='flex flex-wrap gap-2 p-4 border-2 border-dashed border-border rounded-lg min-h-[120px]'
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (!dragItem) {
                            return;
                        }
                        if (dragItem.type === 'bucket') {
                            handleDropBackToSource(dragItem.filename);
                        }
                    }}
                >
                    {sourceImages.length === 0 && (
                        <p className='text-muted-foreground text-sm italic'>
                            All images assigned — drop here to unassign
                        </p>
                    )}
                    {sourceImages.map((img) => (
                        <div
                            key={img.filename}
                            draggable
                            onDragStart={() => handleDragStart('source', undefined, img.filename)}
                            className='relative w-16 h-16 rounded-md overflow-hidden border border-border cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary transition-all shrink-0'
                        >
                            <Image src={img.url} alt='' fill sizes='64px' className='object-contain' unoptimized />
                        </div>
                    ))}
                </div>
            </div>

            {/* Buckets */}
            <div className='flex flex-wrap gap-4 mb-6'>
                {buckets.map((bucket) => {
                    const sanitized = bucket.label
                        .toLowerCase()
                        .replace(/\s+/g, '_')
                        .replace(/[^a-z0-9_]/g, '');
                    const existingCount = existingCounts[sanitized] ?? 0;
                    const totalCount = existingCount + bucket.imageFilenames.length;

                    return (
                        <div
                            key={bucket.id}
                            className='flex-1 min-w-[200px] max-w-[280px]'
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                handleDropOnBucket(bucket.id);
                            }}
                        >
                            <div className='border-2 border-border rounded-lg p-3 bg-card min-h-[250px] flex flex-col'>
                                <div className='flex items-center gap-2 mb-2'>
                                    <input
                                        type='text'
                                        value={bucket.label}
                                        onChange={(e) => updateBucketLabel(bucket.id, e.target.value)}
                                        className='flex-1 text-sm font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1'
                                    />
                                    <span className='text-xs text-muted-foreground whitespace-nowrap'>
                                        ({bucket.imageFilenames.length}/{totalCount})
                                    </span>
                                    <button
                                        type='button'
                                        onClick={() => removeBucket(bucket.id)}
                                        className='text-xs text-destructive hover:text-destructive/80 shrink-0'
                                        title='Remove bucket'
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className='flex-1 flex flex-wrap gap-1.5 content-start min-h-[80px] p-1 rounded-md transition-colors'>
                                    {bucket.imageFilenames.length === 0 && (
                                        <p className='text-xs text-muted-foreground italic w-full text-center pt-6'>
                                            Drop images here
                                        </p>
                                    )}
                                    {bucket.imageFilenames.map((filename) => (
                                        <div
                                            key={filename}
                                            draggable
                                            onDragStart={() => handleDragStart('bucket', bucket.id, filename)}
                                            className='relative w-14 h-14 rounded-md overflow-hidden border border-border cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary transition-all shrink-0'
                                        >
                                            <Image
                                                src={getImageUrl(filename)}
                                                alt=''
                                                fill
                                                sizes='56px'
                                                className='object-contain'
                                                unoptimized
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Add bucket button */}
                <div className='flex-1 min-w-[200px] max-w-[280px]'>
                    <button
                        type='button'
                        onClick={addBucket}
                        className='w-full h-full min-h-[250px] border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-all text-sm'
                    >
                        + Add Bucket
                    </button>
                </div>
            </div>

            {/* Save button */}
            <div className='flex items-center gap-4 mb-6'>
                <button
                    type='button'
                    onClick={handleSave}
                    disabled={saving || sourceImages.length === allImages.length}
                    className='px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                >
                    {saving ? 'Renaming...' : 'Apply & Rename All'}
                </button>
                {sourceImages.length > 0 && sourceImages.length < allImages.length && (
                    <p className='text-sm text-amber-500'>
                        {sourceImages.length} image{sourceImages.length !== 1 ? 's' : ''} still unassigned
                    </p>
                )}
            </div>

            {/* Result */}
            {result && (
                <div
                    className={`p-4 rounded-md border ${
                        result.error || (result.errors && result.errors.length > 0)
                            ? 'border-destructive bg-destructive/10'
                            : 'border-green-500 bg-green-500/10'
                    }`}
                >
                    {result.error && <p className='text-destructive font-medium'>Error: {result.error}</p>}
                    {result.moved !== undefined && (
                        <p className='font-medium'>
                            Successfully renamed {result.moved} image{result.moved !== 1 ? 's' : ''}
                        </p>
                    )}
                    {result.errors && result.errors.length > 0 && (
                        <ul className='mt-1 text-sm text-destructive'>
                            {result.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
