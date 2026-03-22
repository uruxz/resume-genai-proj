FROM node:20-alpine

WORKDIR /app

COPY package.json .

RUN rm -f package-lock.json && npm cache clean --force && npm install --legacy-peer-deps

COPY . .

EXPOSE 5173

CMD [ "npm", "run", "dev" ]