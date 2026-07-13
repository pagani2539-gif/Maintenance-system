import { preview } from 'vite';

export default async function globalSetup() {
  if (process.env.RESPONSIVE_BASE_URL) return undefined;

  const server = await preview({
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  });

  return async () => {
    await new Promise((resolve, reject) => {
      server.httpServer.close((error) => error ? reject(error) : resolve());
    });
  };
}
