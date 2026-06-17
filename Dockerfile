# Single container for the Production Agent (PA) web demo:
# Node serves the built React client and runs the agent service,
# which spawns the Python MCP server as a stdio child.

FROM node:22-slim AS build
WORKDIR /build
COPY web/package.json web/package-lock.json ./
COPY web/server/package.json server/
COPY web/client/package.json client/
RUN npm ci
COPY web/server server
COPY web/client client
RUN npm run build

FROM node:22-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md LICENSE pagent-src/
COPY src pagent-src/src
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir ./pagent-src \
    && rm -rf pagent-src
COPY shows shows

WORKDIR /app/web/server
COPY web/server/package.json ./
RUN npm install --omit=dev
COPY --from=build /build/server/dist dist
COPY --from=build /build/client/dist ../client/dist

ENV NODE_ENV=production \
    PAGENT_MCP_COMMAND=/opt/venv/bin/pagent \
    PAGENT_SHOW=/app/shows/sample-show

EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
