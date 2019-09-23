FROM ubuntu:bionic
ARG GENESIS_PASSWORD
ENV MINER_THREADS=1
RUN apt-get update && apt-get install -y wget curl nodejs mongodb build-essential npm git vim && npm install -g npm@latest && npm install -g node-pre-gyp@latest
WORKDIR /iot_sc_tutorial/
COPY ./ ./
RUN npm install node-pre-gyp -g && cd webui && npm install && cd - && ./install_geth && ./init_geth ${GENESIS_PASSWORD}
EXPOSE 3000
CMD ["./start.sh"]

