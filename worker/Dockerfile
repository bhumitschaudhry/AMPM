FROM node:20-alpine

WORKDIR /app

COPY worker/package.json worker/package-lock.json* ./
RUN npm ci

COPY server/prisma ./prisma
RUN npx prisma generate --schema ./prisma/schema.prisma

COPY worker/ .
RUN npm run build

CMD ["node", "dist/index.js"]
