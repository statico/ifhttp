FROM node:6
COPY server.coffee package.json ./
RUN npm install --silent
RUN mkdir -p /data
VOLUME /data
CMD ["coffee", "server.coffee"]