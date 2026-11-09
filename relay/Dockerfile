FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY match.js ./
COPY relay/server.js ./relay/server.js
ENV HOST=0.0.0.0 PORT=47801 NODE_ENV=production
USER node
EXPOSE 47801
CMD ["node", "relay/server.js"]
