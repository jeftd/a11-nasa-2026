FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json ./
COPY server.js ./
COPY public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
