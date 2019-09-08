FROM ubuntu:bionic
ARG GENESIS_PASSWORD
ENV MINER_THREADS=1
RUN apt-get update && apt-get install -y wget curl nodejs mongodb build-essential npm git vim
WORKDIR /iot_sc_tutorial/
COPY ./ ./
RUN cd webui && npm install && cd - && ./install_geth && ./init_geth ${GENESIS_PASSWORD}
EXPOSE 3000
CMD ["./start.sh"]

