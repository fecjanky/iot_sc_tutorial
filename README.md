# Prerequisites for development

- node (Node.Js)
- npm (Node pacakge manager)
- mongodb
- nodemon (optional)
- docker.io (optional)

# Installation & launch steps for development

- Clone the repository, and `cd` into the checkout directory

- Execute ``` cd webui && npm install && cd -``` : for installing node package dependencies

- Execute `./install_geth` for installing GoEthereum 

- Execute `./init_geth [<password>]` for initializing the etherum node, this command fill create an account that will prefilled, user will be promted for password if not supplied, else the argument will be used as password

- Execute `./start_geth --mine [--miner.threads <Miner trheads>] &`  will start geth with mining enabled

- Execute `./webui/scripts/start_db.sh` to start the db

- Execute `./node webui/main.js` or `./nodemon webui/main.js` to start the web UI

- Alternatively use : `./start.sh` , which is the default command for the docker image (wraps all above commands in a single launcher)

# Build & run the docker image

To build the docker image, the password for the prefill account has to be supplied as the `build-arg`, example:
- `docker build -t iot_sc_tutorial:v0.7 --build-arg GENESIS_PASSWORD=abcd .` will create the docker image `iot_sc_tutorial:v0.7`

- Alternatively the latest image can be pulled by `docker pull fecjanky/iot_sc_tutorial:latest`

- To run the image use `docker run -p 3000:3000 iot_sc_tutorial:v0.7 -e "MINER_THREADS=2"` will start the image binding port 3000 to the container, but overriding the default for `MINER_THREADS` environment variable to 2 - the latter env override is optional

- Use `docker ps` , `docker stop` & `docker start` to manipulate the state of the docker container

- Attach to a running container with `docker exec <container ID> bash` then use `./start_geth attach` to attach to the geth node for administration

# TODOs
- create a list of accounts
- prefill accounts for created users
