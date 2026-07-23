import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'path';
import { homedir } from 'os';
// Set ROWBOAT_WORKDIR to ~/.divinity for the workspace
process.env.ROWBOAT_WORKDIR = resolve(homedir(), '.divinity');
// WebSocket server setup
const wss = new WebSocketServer({ port: 8790 });
console.log('WebSocket bridge server listening on port 8790');
// Store connected clients and subscriptions
const clients = new Set();
const subscriptions = new Map(); // channel -> Set<WebSocket>
// Broadcast to all connected clients
function broadcastToClients(channel, payload) {
    const message = JSON.stringify({
        type: 'event',
        channel,
        data: payload,
    });
    // Convert Set to array for iteration
    const clientArray = Array.from(clients);
    for (const client of clientArray) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            }
            catch (error) {
                console.error(`Error broadcasting to client: ${error}`);
            }
        }
    }
}
// Broadcast to subscribed clients only
function broadcastToSubscribers(channel, payload) {
    const subscribers = subscriptions.get(channel);
    if (!subscribers || subscribers.size === 0)
        return;
    const message = JSON.stringify({
        type: 'event',
        channel,
        data: payload,
    });
    // Convert Set to array for iteration
    const subscriberArray = Array.from(subscribers);
    for (const client of subscriberArray) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            }
            catch (error) {
                console.error(`Error broadcasting to subscriber: ${error}`);
            }
        }
    }
}
// Subscribe a client to a channel
function subscribeClient(client, channel) {
    if (!subscriptions.has(channel)) {
        subscriptions.set(channel, new Set());
    }
    subscriptions.get(channel).add(client);
}
// Unsubscribe a client from a channel
function unsubscribeClient(client, channel) {
    const subscribers = subscriptions.get(channel);
    if (subscribers) {
        subscribers.delete(client);
        if (subscribers.size === 0) {
            subscriptions.delete(channel);
        }
    }
}
// Handle incoming WebSocket messages
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'invoke') {
                handleInvoke(ws, message);
            }
            else if (message.type === 'subscribe') {
                subscribeClient(ws, message.channel);
                ws.send(JSON.stringify({
                    type: 'response',
                    reqId: message.reqId,
                    result: { success: true }
                }));
            }
            else if (message.type === 'unsubscribe') {
                unsubscribeClient(ws, message.channel);
                ws.send(JSON.stringify({
                    type: 'response',
                    reqId: message.reqId,
                    result: { success: true }
                }));
            }
        }
        catch (error) {
            console.error(`Error processing message: ${error}`);
            ws.send(JSON.stringify({
                type: 'error',
                reqId: 'unknown',
                error: `Invalid message format: ${error}`
            }));
        }
    });
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
        // Clean up subscriptions
        const subscriptionEntries = Array.from(subscriptions.entries());
        for (const [channel, subscribers] of subscriptionEntries) {
            subscribers.delete(ws);
            if (subscribers.size === 0) {
                subscriptions.delete(channel);
            }
        }
    });
    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });
});
// Handle invoke requests
async function handleInvoke(ws, message) {
    const { channel, reqId, args } = message;
    try {
        // Handle each channel
        let result;
        switch (channel) {
            // App channels
            case 'app:getVersions':
                result = {
                    chrome: '120.0.0.0',
                    node: '20.0.0',
                    electron: '39.0.0'
                };
                break;
            case 'analytics:bootstrap':
                result = {
                    installationId: 'web-' + Math.random().toString(36).substring(2, 9),
                    apiUrl: 'https://api.divinityworks.com',
                    appVersion: '0.1.0'
                };
                break;
            // Workspace channels - stub implementations
            case 'workspace:getRoot':
                result = '/home/user/divinity';
                break;
            case 'workspace:exists':
                result = true;
                break;
            case 'workspace:stat':
                result = { isFile: false, isDirectory: true };
                break;
            case 'workspace:readdir':
                result = [];
                break;
            case 'workspace:readFile':
                result = '';
                break;
            case 'workspace:writeFile':
                result = {};
                break;
            case 'workspace:mkdir':
                result = {};
                break;
            case 'workspace:rename':
                result = {};
                break;
            case 'workspace:copy':
                result = {};
                break;
            case 'workspace:remove':
                result = {};
                break;
            // Sessions channels - stub implementations
            case 'sessions:create':
                result = { sessionId: 'session-' + Math.random().toString(36).substring(2, 9) };
                break;
            case 'sessions:list':
                result = { sessions: [] };
                break;
            case 'sessions:get':
                result = { sessionId: 'test-session' };
                break;
            case 'sessions:getTurn':
                result = { turnId: 'turn-' + Math.random().toString(36).substring(2, 9) };
                break;
            case 'sessions:sendMessage':
                result = { messageId: 'msg-' + Math.random().toString(36).substring(2, 9) };
                break;
            // Models channels - stub implementations
            case 'models:list':
                result = [
                    { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
                    { id: 'claude-3', name: 'Claude 3', provider: 'anthropic' },
                    { id: 'llama-3', name: 'Llama 3', provider: 'meta' }
                ];
                break;
            case 'models:test':
                result = { success: true };
                break;
            case 'llm:getDefaultModel':
                result = { model: 'gpt-4', provider: 'openai' };
                break;
            case 'llm:generate':
                result = { response: 'Hello from the WebSocket bridge!' };
                break;
            // Search channel - stub implementation
            case 'search:query':
                result = { results: [] };
                break;
            // Default case for unimplemented channels
            default:
                console.warn(`Unhandled IPC channel: ${channel}`);
                result = { error: `Channel not implemented: ${channel}` };
                break;
        }
        // Send response
        ws.send(JSON.stringify({
            type: 'response',
            reqId,
            result
        }));
    }
    catch (error) {
        console.error(`Error handling invoke for ${channel}:`, error);
        ws.send(JSON.stringify({
            type: 'error',
            reqId,
            error: error instanceof Error ? error.message : String(error)
        }));
    }
}
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing WebSocket server');
    wss.close();
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, closing WebSocket server');
    wss.close();
    process.exit(0);
});
