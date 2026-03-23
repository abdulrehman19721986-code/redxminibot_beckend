FROM node:20-slim

# ── System dependencies ───────────────────────────────────────────────────
# ffmpeg   → audio/video processing (required for music, stickers, convert)
# python3  → node-gyp builds (sharp, canvas)
# libvips  → sharp image processing
# git      → some npm packages fetch via git
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    python3 \
    python3-pip \
    make \
    g++ \
    ca-certificates \
    curl \
    libvips-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Verify ffmpeg installed
RUN ffmpeg -version | head -1

WORKDIR /app

# Copy package.json first for layer caching
COPY package.json ./

# Install all npm dependencies
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copy all source files
COPY . .

# Create required runtime directories
RUN mkdir -p sessions data plugins public lib

# Expose web port
EXPOSE 3000

# Railway/Render healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start
CMD ["node", "index.js"]
