# =============================================================================
# Divinity Works — Cloud Edition Dockerfile
# =============================================================================
# Runs the full Divinity Electron app inside a Docker container with:
#   - Xvfb (virtual display — Electron thinks it has a monitor)
#   - noVNC + websockify (HTML5 VNC — user sees the app in their browser)
#   - PulseAudio (virtual sound card — routes TTS audio)
#   - supervisord (manages all processes)
#
# The user opens app.divinityworks.space in their browser → Cloudflare Worker
# authenticates them → proxies to their container's noVNC port (6080) → they
# see the full Divinity UI, exactly as it appears on the desktop.
# =============================================================================

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV RESOLUTION=1280x720x24

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    fluxbox \
    novnc \
    websockify \
    pulseaudio \
    pulsemixer \
    supervisor \
    curl \
    ca-certificates \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    git \
    python3 \
    make \
    g++ \
    x11-utils \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10

# Clone and build the Divinity Electron app
WORKDIR /app
RUN git clone https://github.com/ufuomazech62-cpu/divinityworks-desktop.git /app \
    && cd /app/apps/x \
    && pnpm install --frozen-lockfile \
    && pnpm run deps \
    && cd apps/main \
    && npx electron-forge package --arch=arm64 --platform=linux \
    && echo "Build complete"

# User data directory (persistent volume)
ENV DIVINITY_WORKDIR=/data
RUN mkdir -p /data

# Configure PulseAudio
RUN useradd -m divinity 2>/dev/null || true \
    && mkdir -p /home/divinity/.config/pulse \
    && echo "default-server = unix:/tmp/pulse-socket" > /home/divinity/.config/pulse/client.conf \
    && chown -R divinity:divinity /home/divinity /data

# Supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/divinity.conf

# noVNC — serve HTML5 client on port 6080
RUN ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

EXPOSE 6080
VOLUME /data

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
