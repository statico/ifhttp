FROM node:12-alpine

COPY server.js package.json ./
RUN yarn install

RUN mkdir -p /data
VOLUME /data

CMD "yarn run -s start"
