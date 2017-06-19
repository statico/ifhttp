FROM node:7

# Global install yarn package manager (copied from kkarczmarczyk/docker-node-yarn)
RUN apt-get update && apt-get install -y curl apt-transport-https && \
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - && \
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list && \
    apt-get update && apt-get install -y yarn

COPY server.js package.json ./
RUN yarn install

RUN mkdir -p /data
VOLUME /data

CMD ["yarn", "run", "-s", "start"]
