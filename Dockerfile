FROM ubuntu:bionic

ARG GENESIS_PASSWORD
ARG TUTORIAL_PASSWORD

ENV MINER_THREADS=1

RUN apt-get update && apt-get install -y wget curl nodejs mongodb build-essential npm git vim openssl openssh-server sudo && npm install -g npm@latest && npm install -g node-pre-gyp@latest

WORKDIR /iot_sc_tutorial/
COPY ./ ./

RUN npm install node-pre-gyp -g && cd webui && npm install && cd - && ./admin/install_geth && ./admin/init_geth ${GENESIS_PASSWORD} && ./webui/scripts/gencerts.sh && ./admin/create_ssh

EXPOSE 80/tcp
EXPOSE 80/udp
EXPOSE 443/tcp
EXPOSE 443/udp
EXPOSE 22/udp
EXPOSE 22/tcp

CMD ["./admin/start.sh"]

