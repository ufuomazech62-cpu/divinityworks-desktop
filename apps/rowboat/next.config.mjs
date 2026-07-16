/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    serverExternalPackages: [
        'awilix',
    ],
    async rewrites() {
        // The Divinity desktop app calls all backend APIs at the root `/v1/*`
        // path, while the server implements them under `/api/*` (chat lives at
        // `/api/v1/[projectId]/chat`). Map the desktop's expected paths to the
        // real handlers. File-system routes (e.g. the new `/v1/config`) take
        // precedence over these afterFiles rewrites.
        return [
            { source: '/v1/me', destination: '/api/me' },
            { source: '/v1/:path*', destination: '/api/v1/:path*' },
        ];
    },
};

export default nextConfig;
