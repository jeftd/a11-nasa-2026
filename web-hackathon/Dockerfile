FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js chat-agent.js ./
COPY public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
