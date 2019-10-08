FROM ubuntu:bionic

ARG GENESIS_PASSWORD
ARG TUTORIAL_PASSWORD

ENV MINER_THREADS=1

RUN apt-get update && apt-get install -y wget curl nodejs mongodb build-essential npm git vim openssl openssh-server sudo && npm install -g npm@latest && npm install -g node-pre-gyp@latest

WORKDIR /iot_sc_tutorial/
COPY ./ ./

RUN npm install node-pre-gyp -g && cd webui && npm install && cd - && ./install_geth && ./init_geth ${GENESIS_PASSWORD} && ./webui/scripts/gencerts.sh && mkdir /var/run/sshd && chmod 0755 /var/run/sshd && useradd -d /iot_sc_tutorial/ --shell /bin/bash --groups sudo tutorial && echo tutorial:${TUTORIAL_PASSWORD} | chpasswd

EXPOSE 80/tcp
EXPOSE 80/udp
EXPOSE 443/tcp
EXPOSE 443/udp
EXPOSE 22/udp
EXPOSE 22/tcp

CMD ["./start.sh"]

