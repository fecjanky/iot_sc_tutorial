#!/bin/sh
WORKDIR=$(dirname $0)
mkdir -p $WORKDIR/../certs/
openssl req -subj '/CN=blockchain.cnsm2019-tutorial.com/O=BUTE TMIT/C=HU' -x509 -nodes -days 365 -newkey rsa:2048 -keyout $WORKDIR/../certs/selfsigned.key -out $WORKDIR/../certs/selfsigned.crt