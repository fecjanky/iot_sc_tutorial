FROM ubuntu:bionic

ARG GENESIS_PASSWORD

ENV MINER_THREADS=1

RUN apt-get update && apt-get install -y wget curl nodejs mongodb build-essential npm git vim openssl && npm install -g npm@latest && npm install -g node-pre-gyp@latest

WORKDIR /iot_sc_tutorial/
COPY ./ ./

RUN npm install node-pre-gyp -g && cd webui && npm install && cd - && ./install_geth && ./init_geth ${GENESIS_PASSWORD} && ./webui/scripts/gencerts.sh

EXPOSE 8080/tcp
EXPOSE 8080/udp
EXPOSE 8443/tcp
EXPOSE 8443/udp

CMD ["./start.sh"]

