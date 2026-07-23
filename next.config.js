const nextRoutes = require('nextjs-routes/config');
const withRoutes = nextRoutes();

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    serverExternalPackages: ['knex', 'pino', 'pino-pretty', 'piscina'],
    reactStrictMode: true,
    trailingSlash: false,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'github.githubassets.com',
                pathname: '/images/modules/logos_page/GitHub-Mark.png',
            },
        ],
    },
    async headers() {
        return [
            {
                source: '/images/companies/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
        ];
    },
};

module.exports = withRoutes(nextConfig);
