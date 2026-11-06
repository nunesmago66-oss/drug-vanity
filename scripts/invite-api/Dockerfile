# DRUG URL invite backend — build from the PROJECT ROOT:
#   docker build -f scripts/invite-api/Dockerfile -t drugurl-invite-api .
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Only tsx is needed: the backend uses Node built-ins and the project's own TS modules.
RUN npm install --no-save --no-audit --no-fund tsx@4 && npm cache clean --force
COPY tsconfig.json ./
COPY src/lib/vanity ./src/lib/vanity
COPY scripts/invite-api ./scripts/invite-api
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "scripts/invite-api/server.ts"]
