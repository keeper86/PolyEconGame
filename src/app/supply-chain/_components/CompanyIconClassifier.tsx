// TEMP-DEV: Company icon classifier - will be removed
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffect, useMemo, useState } from 'react';

interface Category {
    key: string;
    label: string;
    group: 'facility' | 'level' | 'general';
}

interface FileData {
    name: string;
    category: string | null; // null = unclassified
}

interface ApiResponse {
    files: string[];
    total: number;
    categories: Category[];
    existingInCompanies: string[];
}

interface ApiApplyResponse {
    dryRun: boolean;
    totalProcessed: number;
    results: { oldName: string; newName: string; category: string }[];
    errors?: { oldName: string; error: string }[];
    counters: Record<string, number>;
}

const COLOR_BY_GROUP: Record<string, string> = {
    facility: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    level: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    general:
        'bg-stone-100 text-stone-800 border-stone-300 dark:bg-stone-800/50 dark:text-stone-300 dark:border-stone-600',
};

function getFilenamePreview(origName: string, categoryKey: string | null, counter: number): string {
    if (!categoryKey) {
        return origName;
    }
    return `company_icon_${categoryKey}_${String(counter).padStart(2, '0')}.webp`;
}

export default function CompanyIconClassifier() {
    const [files, setFiles] = useState<FileData[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [dryRun, setDryRun] = useState(true);
    const [result, setResult] = useState<ApiApplyResponse | null>(null);
    const [filter, setFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

    // Load initial data
    useEffect(() => {
        fetch('/api/dev/company-icons')
            .then((r) => r.json())
            .then((data: ApiResponse) => {
                setFiles(data.files.map((f) => ({ name: f, category: null })));
                setCategories(data.categories);

                // Pre-compute category counters
                const counts: Record<string, number> = {};
                for (const f of data.existingInCompanies) {
                    const match = f.match(/^company_icon_(\w+)_(\d+)\.webp$/);
                    if (match) {
                        const num = parseInt(match[2], 10) + 1;
                        if (!counts[match[1]] || num > counts[match[1]]) {
                            counts[match[1]] = num;
                        }
                    }
                }
                // Seed also from files that would be in general or other categories
                for (const f of data.files) {
                    const match = f.match(/Gemini_company_icon_(\w+)_\d+\.webp$/);
                    if (match) {
                        const num = parseInt(f.match(/_(\d+)\.webp$/)![1], 10) + 1;
                        if (!counts[match[1]] || num > counts[match[1]]) {
                            counts[match[1]] = num;
                        }
                    }
                }
                setCategoryCounts(counts);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to load company icons', err);
                setLoading(false);
            });
    }, []);

    // Count by category and group
    const stats = useMemo(() => {
        const classified = files.filter((f) => f.category !== null).length;
        const perCategory: Record<string, number> = {};
        const perGroup: Record<string, number> = {};
        for (const f of files) {
            if (f.category) {
                perCategory[f.category] = (perCategory[f.category] ?? 0) + 1;
                const cat = categories.find((c) => c.key === f.category);
                if (cat) {
                    perGroup[cat.group] = (perGroup[cat.group] ?? 0) + 1;
                }
            }
        }
        return { total: files.length, classified, unclassified: files.length - classified, perCategory, perGroup };
    }, [files, categories]);

    const filteredFiles = useMemo(() => {
        let result = files;
        if (filter === 'unclassified') {
            result = result.filter((f) => f.category === null);
        } else if (filter === 'classified') {
            result = result.filter((f) => f.category !== null);
        } else if (filter.startsWith('cat:')) {
            const catKey = filter.slice(4);
            result = result.filter((f) => f.category === catKey);
        }
        if (search) {
            const q = search.toLowerCase();
            result = result.filter((f) => f.name.toLowerCase().includes(q));
        }
        return result;
    }, [files, filter, search]);

    function setCategory(filename: string, categoryKey: string) {
        setFiles((prev) => prev.map((f) => (f.name === filename ? { ...f, category: categoryKey } : f)));
    }

    function classifyAllAsGeneral() {
        setFiles((prev) => prev.map((f) => (f.category === null ? { ...f, category: 'general' } : f)));
    }

    function resetAll() {
        setFiles((prev) => prev.map((f) => ({ ...f, category: null })));
    }

    async function handleApply() {
        const classifications: Record<string, string> = {};
        for (const f of files) {
            if (f.category) {
                classifications[f.name] = f.category;
            }
        }

        setApplying(true);
        try {
            const resp = await fetch('/api/dev/company-icons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classifications, dryRun }),
            });
            const data: ApiApplyResponse = await resp.json();
            setResult(data);

            // If it was a real run, update counters
            if (!dryRun && !data.errors) {
                setCategoryCounts(data.counters);
            }
        } catch (err) {
            console.error('Apply failed', err);
        } finally {
            setApplying(false);
        }
    }

    const getNextCounter = (catKey: string) => categoryCounts[catKey] ?? 0;

    if (loading) {
        return <div className='p-8 text-center text-muted-foreground'>Loading company icons…</div>;
    }

    return (
        <div className='space-y-4'>
            {/* Summary bar */}
            <Card>
                <CardHeader className='pb-2 pt-3 px-4'>
                    <CardTitle className='text-sm font-semibold'>
                        Company Icon Classifier
                        <Badge variant='outline' className='ml-2 text-xs font-normal'>
                            TEMP-DEV
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className='px-4 pb-3'>
                    <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
                        <span className='text-sm'>
                            Total: <strong>{stats.total}</strong>
                        </span>
                        <span className='text-sm text-green-600'>
                            Classified: <strong>{stats.classified}</strong>
                        </span>
                        {stats.unclassified > 0 && (
                            <span className='text-sm text-red-600'>
                                Unclassified: <strong>{stats.unclassified}</strong>
                            </span>
                        )}
                        <div className='flex flex-wrap gap-2 ml-2'>
                            {Object.entries(stats.perGroup).map(([group, count]) => (
                                <Badge key={group} variant='outline' className='text-xs'>
                                    {group}: {count}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Filters */}
            <div className='flex flex-wrap items-center gap-2'>
                <div className='flex flex-wrap gap-1.5'>
                    <FilterButton label='All' active={filter === 'all'} onClick={() => setFilter('all')} />
                    <FilterButton
                        label={`Unclassified (${stats.unclassified})`}
                        active={filter === 'unclassified'}
                        onClick={() => setFilter('unclassified')}
                    />
                    <FilterButton
                        label={`Classified (${stats.classified})`}
                        active={filter === 'classified'}
                        onClick={() => setFilter('classified')}
                    />
                </div>
                <Input
                    placeholder='Search filenames…'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className='w-56 h-8 text-sm'
                />
            </div>

            {/* Category quick-jump */}
            <details>
                <summary className='text-xs text-muted-foreground cursor-pointer hover:text-foreground'>
                    Jump to category ({categories.length} categories)
                </summary>
                <div className='flex flex-wrap gap-1 mt-1 max-h-40 overflow-y-auto'>
                    {categories.map((cat) => (
                        <button
                            key={cat.key}
                            onClick={() => setFilter(`cat:${cat.key}`)}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                filter === `cat:${cat.key}`
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : (COLOR_BY_GROUP[cat.group] ?? 'border-border hover:bg-muted')
                            }`}
                        >
                            {cat.label} ({stats.perCategory[cat.key] ?? 0})
                        </button>
                    ))}
                </div>
            </details>

            {/* Bulk actions */}
            <div className='flex flex-wrap items-center gap-2'>
                <Button variant='outline' size='sm' onClick={classifyAllAsGeneral}>
                    Set All Unclassified → General
                </Button>
                <Button variant='outline' size='sm' onClick={resetAll}>
                    Reset All
                </Button>
                <div className='ml-auto flex items-center gap-2'>
                    <label className='flex items-center gap-1.5 text-xs cursor-pointer'>
                        <input
                            type='checkbox'
                            checked={dryRun}
                            onChange={() => setDryRun(!dryRun)}
                            className='accent-primary'
                        />
                        Dry run (no actual file moves)
                    </label>
                    <Button onClick={handleApply} disabled={applying || stats.classified === 0} size='sm'>
                        {applying ? 'Applying…' : dryRun ? 'Preview Renames' : `Apply (${stats.classified} files)`}
                    </Button>
                </div>
            </div>

            {/* Result panel */}
            {result && (
                <Card className={result.errors ? 'border-amber-400' : 'border-green-400'}>
                    <CardHeader className='pb-2 pt-3 px-4'>
                        <CardTitle className='text-sm'>
                            {result.dryRun ? '📋 Preview Result' : '✅ Apply Result'}
                            <Badge variant='outline' className='ml-2 text-xs'>
                                {result.totalProcessed} files processed
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='px-4 pb-3'>
                        {result.errors && (
                            <div className='text-xs text-amber-600 mb-2'>{result.errors.length} errors occurred</div>
                        )}
                        <div className='max-h-40 overflow-y-auto text-xs space-y-0.5'>
                            {result.results.slice(0, 100).map((r) => (
                                <div key={r.oldName} className='flex gap-2 font-mono'>
                                    <span className='text-muted-foreground w-64 truncate'>{r.oldName}</span>
                                    <span className='text-foreground'>→</span>
                                    <span className='text-green-700'>{r.newName}</span>
                                    <Badge variant='outline' className='text-[10px] ml-1'>
                                        {r.category}
                                    </Badge>
                                </div>
                            ))}
                            {result.results.length > 100 && (
                                <div className='text-muted-foreground mt-1'>
                                    …and {result.results.length - 100} more
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Icon grid */}
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
                {filteredFiles.map((f) => {
                    const catInfo = categories.find((c) => c.key === f.category);
                    return (
                        <Card
                            key={f.name}
                            className={`overflow-hidden ${f.category ? 'border-green-300/50' : 'opacity-80'}`}
                        >
                            <div className='aspect-square relative bg-muted/30 flex items-center justify-center p-2'>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`/${f.name}`}
                                    alt={f.name}
                                    className='max-w-full max-h-full object-contain'
                                    loading='lazy'
                                />
                            </div>
                            <div className='p-2 space-y-1.5'>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className='text-[10px] font-mono truncate text-muted-foreground cursor-help'>
                                                {f.name}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className='text-xs'>{f.name}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <select
                                    value={f.category ?? ''}
                                    onChange={(e) => setCategory(f.name, e.target.value)}
                                    className='w-full text-[11px] border rounded px-1 py-0.5 bg-background'
                                >
                                    <option value=''>— Unclassified —</option>
                                    {(['facility', 'level', 'general'] as const).map((group) => (
                                        <optgroup key={group} label={group.charAt(0).toUpperCase() + group.slice(1)}>
                                            {categories
                                                .filter((c) => c.group === group)
                                                .map((cat) => (
                                                    <option key={cat.key} value={cat.key}>
                                                        {cat.label}
                                                    </option>
                                                ))}
                                        </optgroup>
                                    ))}
                                </select>

                                {f.category && (
                                    <div className='flex items-center gap-1'>
                                        <Badge
                                            variant='outline'
                                            className={`text-[9px] px-1 py-0 ${COLOR_BY_GROUP[catInfo?.group ?? ''] ?? ''}`}
                                        >
                                            {f.category}
                                        </Badge>
                                        <span className='text-[9px] font-mono text-muted-foreground truncate'>
                                            {getFilenamePreview(f.name, f.category, getNextCounter(f.category))}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>

            {filteredFiles.length === 0 && (
                <div className='text-center text-muted-foreground py-12'>No files match the current filter.</div>
            )}
        </div>
    );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted text-muted-foreground'
            }`}
        >
            {label}
        </button>
    );
}
