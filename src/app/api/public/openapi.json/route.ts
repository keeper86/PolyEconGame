import { publicAccessibleRouter } from '@/server/router';
import { NextResponse } from 'next/server';
import { generateOpenApiDocument } from 'trpc-to-openapi';

export const GET = () => {
    const apiSpec = generateOpenApiDocument(publicAccessibleRouter, {
        title: 'Game API',
        version: '1.0.0',
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'baseUrl not set',
    });
    return NextResponse.json(apiSpec);
};
