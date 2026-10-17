FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Native dependencies required to compile better-sqlite3 when a prebuilt binary is unavailable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["npm", "start"]
