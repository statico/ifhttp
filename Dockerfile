FROM node:12-alpine

RUN mkdir /app
WORKDIR /app

ADD server.js package.json yarn.lock ./
RUN yarn install --pure-lockfile

RUN mkdir -p /data
VOLUME /data

CMD node server.js
