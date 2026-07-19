/**
 * Cloud Divinity — container management API.
 *
 *   POST /api/cloud/spawn   — start a container for the authenticated user
 *   GET  /api/cloud/status   — check if the user's container is running
 *   POST /api/cloud/sleep    — sleep the container (free up resources)
 *   GET  /api/cloud/connect  — get the noVNC WebSocket URL for the container
 *
 * The Worker talks to the Oracle Cloud VM via SSH (using the existing
 * cloudflared tunnel) to run Docker commands. Each user gets their own
 * container named divinity-<user_id> with a persistent volume.
 *
 * Container lifecycle:
 *   1. User opens app.divinityworks.space → Worker calls /api/cloud/spawn
 *   2. Worker SSHes to the Oracle VM, runs `docker run -d --name divinity-<user_id>
 *      -v divinity-data-<user_id>:/data ... divinity-cloud:latest`
 *   3. Container starts Xvfb → Electron → noVNC on port 6080
 *   4. Worker returns the noVNC URL: wss://app.divinityworks.space/vnc/<user_id>
 *   5. Cloudflare Worker proxies the WebSocket to the container's port 6080
 *   6. User sees the full Divinity UI in their browser
 *   7. After 30 min of inactivity, Worker calls /api/cloud/sleep → docker stop
 *   8. Next time the user connects, /api/cloud/spawn starts it again (~5s)
 */

import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import type { Env, AuthVars } from '../lib/env.js';

export const cloud = new Hono<{ Bindings: Env; Variables: AuthVars }>();

cloud.use('*', requireAuth);

// The Oracle VM's internal hostname (reachable via cloudflared tunnel).
// The SaaS Worker connects to this via the tunnel's WebSocket or HTTP endpoint.
const DOCKER_HOST = 'http://localhost:2375'; // Docker daemon on the Oracle VM

/**
 * POST /api/cloud/spawn — start (or wake) the user's Divinity container.
 * Returns the noVNC URL the browser should connect to.
 */
cloud.post('/spawn', async (c) => {
  const user = c.get('user')!;
  const containerName = `divinity-${user.id}`;
  const volumeName = `divinity-data-${user.id}`;
  const port = portForUser(user.id);

  // Check if the container is already running
  const inspectRes = await fetch(`${DOCKER_HOST}/containers/${containerName}/json`, {
    headers: { 'X-Config-Header': 'true' },
  });

  if (inspectRes.ok) {
    const container = await inspectRes.json() as any;
    if (container.State?.Running) {
      // Already running — return the connection URL
      return c.json({
        status: 'running',
        url: `/vnc/${user.id}`,
        port,
      });
    }
    // Exists but stopped — start it
    await fetch(`${DOCKER_HOST}/containers/${containerName}/start`, { method: 'POST' });
    return c.json({
      status: 'starting',
      url: `/vnc/${user.id}`,
      port,
    });
  }

  // Create + start a new container
  const createBody = {
    Image: 'divinity-cloud:latest',
    name: containerName,
    Env: [
      `DIVINITY_WORKDIR=/data`,
      `DIVINITY_USER_ID=${user.id}`,
      `DIVINITY_USER_EMAIL=${user.email}`,
      `DISPLAY=:99`,
      `RESOLUTION=1280x720x24`,
    ],
    HostConfig: {
      PortBindings: {
        '6080/tcp': [{ HostPort: String(port) }],
      },
      Binds: [`${volumeName}:/data`],
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 1073741824, // 1GB RAM limit per user
      MemorySwap: 2147483648, // 2GB with swap
    },
  };

  const createRes = await fetch(`${DOCKER_HOST}/containers/create?name=${containerName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error('[cloud] Failed to create container:', err);
    return c.json({ error: 'Failed to start container', detail: err }, 500);
  }

  // Start the container
  await fetch(`${DOCKER_HOST}/containers/${containerName}/start`, { method: 'POST' });

  return c.json({
    status: 'starting',
    url: `/vnc/${user.id}`,
    port,
    message: 'Container is starting. This takes ~5-10 seconds.',
  });
});

/**
 * GET /api/cloud/status — check if the user's container is running.
 */
cloud.get('/status', async (c) => {
  const user = c.get('user')!;
  const containerName = `divinity-${user.id}`;

  const inspectRes = await fetch(`${DOCKER_HOST}/containers/${containerName}/json`);
  if (!inspectRes.ok) {
    return c.json({ status: 'not_created' });
  }

  const container = await inspectRes.json() as any;
  return c.json({
    status: container.State?.Running ? 'running' : 'stopped',
    url: container.State?.Running ? `/vnc/${user.id}` : null,
    startedAt: container.State?.StartedAt || null,
  });
});

/**
 * POST /api/cloud/sleep — stop the user's container (frees RAM, keeps data).
 */
cloud.post('/sleep', async (c) => {
  const user = c.get('user')!;
  const containerName = `divinity-${user.id}`;

  await fetch(`${DOCKER_HOST}/containers/${containerName}/stop?t=10`, { method: 'POST' });
  return c.json({ status: 'stopped' });
});

/**
 * GET /api/cloud/connect — get the noVNC connection info.
 */
cloud.get('/connect', async (c) => {
  const user = c.get('user')!;
  const port = portForUser(user.id);

  return c.json({
    url: `/vnc/${user.id}`,
    port,
    websocketUrl: `wss://app.divinityworks.space/vnc/${user.id}/websockify`,
  });
});

/**
 * Determine the noVNC port for a user.
 * Ports 6080-6179 = 100 concurrent users.
 * In production, use Docker networking + a reverse proxy instead.
 */
function portForUser(userId: string): number {
  // Hash the user ID to a port in range 6080-6179
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return 6080 + (Math.abs(hash) % 100);
}
