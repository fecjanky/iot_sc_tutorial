= Prerequisites

- node (Node.Js)
- npm (Node pacakge manager)
- mongodb 

= Installation steps

pushd webui && npm install && popd
./install_geth && ./init_geth 

= Starting everything

- ./start_geth (in the geth console also start mining by 'miner.start(1)')
- ./webui/scripts/start_db.sh (might have to kill the default mongod until the script is updated the use a different port)
- ./node webui/main.js


= TODO
- solve prefill accounts
