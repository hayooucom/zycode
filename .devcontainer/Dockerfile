FROM mcr.microsoft.com/devcontainers/typescript-node:18-bookworm

ADD install-zycode.sh /root/
RUN /root/install-zycode.sh

RUN git config --system codespaces-theme.hide-status 1

USER node
RUN YARN_CACHE="$(yarn cache dir)" && rm -rf "$YARN_CACHE" && ln -s /zycode-dev/yarn-cache "$YARN_CACHE"

USER root
CMD chown node:node /zycode-dev && sudo -u node mkdir -p /zycode-dev/yarn-cache && sleep inf
