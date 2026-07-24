/**
 * Web Preload Shim — replaces the Electron preload for browser builds.
 *
 * In Electron, the preload script exposes window.ipc via contextBridge.
 * In the browser, we replace it with a WebSocket client that talks to the
 * web-bridge server, which imports @x/core directly.
 *
 * This file is injected before the renderer bundle so window.ipc exists
 * before any React code runs.
 */

/* eslint-disable */
// @ts-nocheck  — this runs in the browser, not under Node/tsc

(function () {
  'use strict';

  // ── WebSocket connection ──────────────────────────────────────────
  var WS_URL = (function () {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var host = location.host; // includes port if non-default (e.g. localhost:8790)
    return proto + '//' + host + '/ws';
  })();

  // Read the auth token from URL param, localStorage, or hash
  var AUTH_TOKEN = (function () {
    // 1. Check URL query param (?token=...&refresh_token=...)
    var urlParams = new URLSearchParams(window.location.search);
    var urlToken = urlParams.get('token') || urlParams.get('access_token');
    var urlRefresh = urlParams.get('refresh_token');
    if (urlToken) {
      localStorage.setItem('dw_access_token', urlToken);
      if (urlRefresh) localStorage.setItem('dw_refresh_token', urlRefresh);
      // Clean the URL
      var cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      return urlToken;
    }
    // 2. Check localStorage (same origin)
    return localStorage.getItem('dw_access_token') || '';
  })();

  // ── Token refresh: proactively refresh the access token before it
  // expires. The SaaS Worker issues 15-min access tokens + 30-day
  // refresh tokens. We call /auth/refresh every 14 min to get a fresh
  // access token. This prevents the WS from going stale and the page
  // from redirecting to signin on refresh. ──────────────────────
  function refreshTokenNow() {
    var rt = localStorage.getItem('dw_refresh_token');
    if (!rt) return Promise.resolve(null);
    return fetch('https://dash.divinityworks.space/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    }).then(function (res) {
      if (!res.ok) throw new Error('refresh failed');
      return res.json();
    }).then(function (tokens) {
      if (tokens.access_token) {
        AUTH_TOKEN = tokens.access_token;
        localStorage.setItem('dw_access_token', tokens.access_token);
        if (tokens.refresh_token) {
          localStorage.setItem('dw_refresh_token', tokens.refresh_token);
        }
        console.log('[web-preload] Token refreshed');
        // Reconnect WebSocket with the fresh token so the server
        // sees the new auth token on the subprotocol.
        if (ws) {
          try { ws.close(); } catch (e) {}
          // onclose will trigger reconnect via setTimeout
        }
        return tokens.access_token;
      }
      return null;
    }).catch(function (e) {
      console.error('[web-preload] Token refresh failed:', e);
      return null;
    });
  }

  // Refresh every 14 minutes (access token TTL is 15 min)
  setInterval(refreshTokenNow, 14 * 60 * 1000);
  // Also refresh on tab focus (covers case where tab was inactive)
  window.addEventListener('focus', function () {
    var token = localStorage.getItem('dw_access_token');
    if (token) {
      try {
        var parts = token.split('.');
        if (parts.length === 3) {
          var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.exp && Date.now() >= (payload.exp - 60) * 1000) {
            refreshTokenNow();
          }
        }
      } catch (e) {}
    }
  });

  // Pending invoke requests keyed by reqId
  var pending = {};

  // Push channel subscribers
  var subscribers = {};

  // Connection state
  var ws = null;
  var connected = false;
  var reconnectTimer = null;
  var messageQueue = [];

  function connect() {
    try {
      // Pass auth token as subprotocol so the server can read it
      ws = AUTH_TOKEN
        ? new WebSocket(WS_URL, ['bearer', AUTH_TOKEN])
        : new WebSocket(WS_URL);
    } catch (e) {
      console.error('[web-preload] Cannot create WebSocket:', e);
      setTimeout(connect, 2000);
      return;
    }

    ws.onopen = function () {
      connected = true;
      console.log('[web-preload] WebSocket connected to', WS_URL);
      // Flush queued messages
      while (messageQueue.length > 0) {
        try { ws.send(messageQueue.shift()); } catch (e) {}
      }
      // Resubscribe to all channels
      for (var channel in subscribers) {
        send({ type: 'subscribe', channel: channel });
      }
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'response':
            if (pending[msg.reqId]) {
              var p = pending[msg.reqId];
              delete pending[msg.reqId];
              p.resolve(msg.result);
            }
            break;
          case 'error':
            if (pending[msg.reqId]) {
              var p2 = pending[msg.reqId];
              delete pending[msg.reqId];
              p2.reject(new Error(msg.error || 'Unknown error'));
            }
            break;
          case 'event':
            // Broadcast push event to all subscribers of this channel
            var subs = subscribers[msg.channel];
            if (subs) {
              for (var i = 0; i < subs.length; i++) {
                try { subs[i](msg.data); } catch (e) { console.error('[web-preload] Subscriber error:', e); }
              }
            }
            break;
        }
      } catch (e) {
        console.error('[web-preload] Failed to parse message:', e);
      }
    };

    ws.onclose = function () {
      connected = false;
      console.warn('[web-preload] WebSocket closed, reconnecting in 2s...');
      // Reject all pending requests
      for (var id in pending) {
        pending[id].reject(new Error('WebSocket disconnected'));
        delete pending[id];
      }
      reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = function (err) {
      console.error('[web-preload] WebSocket error:', err);
    };
  }

  function send(msg) {
    var data = JSON.stringify(msg);
    if (connected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    } else {
      messageQueue.push(data);
    }
  }

  // ── Generate unique request IDs ───────────────────────────────────
  var reqCounter = 0;
  function nextReqId() {
    return 'r' + Date.now().toString(36) + (reqCounter++).toString(36);
  }

  // ── Connect immediately ───────────────────────────────────────────
  connect();

  // ── window.ipc implementation ─────────────────────────────────────
  var ipc = {
    invoke: function (channel, args) {
      var reqId = nextReqId();
      return new Promise(function (resolve, reject) {
        pending[reqId] = { resolve: resolve, reject: reject };
        send({ type: 'invoke', channel: channel, reqId: reqId, args: args || null });
        // Timeout after 60 seconds
        setTimeout(function () {
          if (pending[reqId]) {
            delete pending[reqId];
            reject(new Error('IPC invoke timeout: ' + channel));
          }
        }, 60000);
      });
    },

    send: function (channel, args) {
      // Fire-and-forget: send to server, no response expected
      send({ type: 'send', channel: channel, args: args || null });
    },

    on: function (channel, handler) {
      if (!subscribers[channel]) {
        subscribers[channel] = [];
        // Tell the server we want to subscribe to this channel
        send({ type: 'subscribe', channel: channel });
      }
      subscribers[channel].push(handler);
      return function () {
        var subs = subscribers[channel];
        if (subs) {
          var idx = subs.indexOf(handler);
          if (idx >= 0) subs.splice(idx, 1);
          if (subs.length === 0) {
            delete subscribers[channel];
            send({ type: 'unsubscribe', channel: channel });
          }
        }
      };
    },
  };

  // ── window.electronUtils stub ─────────────────────────────────────
  var electronUtils = {
    getPathForFile: function (file) {
      return file.name;
    },
    getZoomFactor: function () {
      return 1;
    },
  };

  // ── Inject into window ────────────────────────────────────────────
  window.ipc = ipc;
  window.electronUtils = electronUtils;
  // Flag so renderer code can detect web mode and hide Electron-only UI
  window.isWeb = true;
})();
