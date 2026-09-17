FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.html styles.css app.js server.js ./
ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]
