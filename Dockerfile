FROM node:7

# Install Yarn - https://yarnpkg.com/en/docs/install#linux-tab
ADD https://dl.yarnpkg.com/debian/pubkey.gpg /tmp/yarn.gpg
RUN apt-key add /tmp/yarn.gpg
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" >/etc/apt/sources.list.d/yarn.list
RUN apt-get update && sudo apt-get install yarn

COPY server.js package.json ./
RUN yarn install

RUN mkdir -p /data
VOLUME /data

CMD ["yarn", "run", "-s", "start"]
