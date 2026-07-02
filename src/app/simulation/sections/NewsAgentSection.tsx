'use client';

import { trpcClient } from '@/lib/trpc';
import { useState } from 'react';

export default function NewsAgentSection() {
    const [prompt, setPrompt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    async function fetchPrompt() {
        setLoading(true);
        setError(null);
        setPrompt(null);
        try {
            const result = await trpcClient.simulation.generateNewsReport.query();
            setPrompt(result.prompt);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    function copyToClipboard() {
        if (!prompt) return;
        navigator.clipboard.writeText(prompt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <section>
            <h2 id='news-agent' className='text-xl font-semibold mb-4'>
                16. News Agent (temporary debug UI)
            </h2>

            <p className='text-muted-foreground mb-4'>
                Extracts a monthly report from the current game state, compares it to the previous month, and builds a
                prompt for an LLM to generate economic news articles.
            </p>

            <button
                onClick={fetchPrompt}
                disabled={loading}
                className='rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/80 disabled:opacity-50'
            >
                {loading ? 'Generating...' : 'Generate News Prompt'}
            </button>

            {error && (
                <div className='mt-4 rounded border border-destructive bg-destructive/10 p-4 text-destructive'>
                    Error: {error}
                </div>
            )}

            {prompt && (
                <div className='mt-4'>
                    <div className='mb-2 flex items-center justify-between'>
                        <span className='text-sm text-muted-foreground'>Generated prompt:</span>
                        <button
                            onClick={copyToClipboard}
                            className='rounded border bg-background px-2 py-1 text-xs hover:bg-accent'
                        >
                            {copied ? 'Copied!' : 'Copy to clipboard'}
                        </button>
                    </div>
                    <pre className='max-h-[600px] overflow-auto whitespace-pre-wrap rounded border bg-muted p-4 text-xs leading-relaxed'>
                        {prompt}
                    </pre>
                </div>
            )}
        </section>
    );
}