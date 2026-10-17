# One container for the hosted server: tracker.py (API, port 8000, internal only)
# and the Next.js app (pages and /api proxy, port 3000, public).

FROM node:24-slim AS build
WORKDIR /srv/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN STANDALONE=1 npx next build

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY tracker.py mock_data.py bridge.py synthetic.json start.sh ./
COPY maize_tracker/maize_tracker.ino maize_tracker/
COPY --from=build /srv/app/.next/standalone ./app/
COPY --from=build /srv/app/.next/static ./app/.next/static
COPY --from=build /srv/app/public ./app/public
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data TZ=Africa/Johannesburg
RUN mkdir -p /data && chmod +x start.sh
EXPOSE 3000
CMD ["./start.sh"]
