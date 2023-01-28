const express = require('express');
const bodyParser = require('body-parser');
const rp = require('request-promise');
const Wallet = require('./wallet');
const Transaction = require('./it/transaction');
const Blockchain = require('./blockchain');
const PBFT = require('./pbft');
const P2pServer = require('./p2p-server');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

validatorPrivateKeys = [
    '0xcde9775a685f51565c4bb17cdb25e095c3647a21dd9fc6b2b59efe8d27384bac', // 0xd7EAc19Ae95011ec671f30BE2fC38084bB5650c8
    '0x7efa5673601e453f993d418cedfb21a95efc4db455a6be15b6bc97a714cb53c3', // 0x89758a9f224Be67B669A221e85251C85109a46B8
    '0x4f17a6b5c6afe30d80e367cc986b38ea390dafb6cb63bfbcbf1b0a6b5f508eb9', // 0x7216dd0e160729c202a58db1B021C721aA78D8F1
    '0x02248b3571db57adbad4009ce95bf915aa5761a71e8bc64ece9c450abe1de3ed' // 0xf40cAA80ba7d40b67C282D794eE3715Ac036338f
]

id = process.argv[2]
const validatorWallet = new Wallet(validatorPrivateKeys[id]);

node = {
    httpPort: process.argv[3],
    url: process.argv[4],
    p2pPort: process.argv[5],
    ws: process.argv[6],
    address: validatorWallet.address
}

const blockchain = new Blockchain();
const pbft = new PBFT();
const p2pServer = new P2pServer(blockchain, pbft, node, validatorWallet);

app.get('/blockchain', function(req, res) {
    res.send(p2pServer.blockchain.chain);
});

app.get('/txPool', function(req, res) {
    res.send(p2pServer.blockchain.txPool);
});

app.get('/state', function(req, res) {
    res.send(p2pServer.blockchain.state.state0);
});

app.get('/latest', function(req, res) {
    res.send(p2pServer.blockchain.getLastBlock());
});

app.get('/view', function(req, res) {
    res.json({ view: p2pServer.pbft.view });
});

app.get('/block/:start/:end', function(req, res) {
    const start = req.params.start;
    let end = req.params.end;
    if (end == 0) end = p2pServer.blockchain.chain.length;
    const blocks = p2pServer.blockchain.chain.slice(start-1, end);
    res.send(blocks);
});

app.get('/block/:blockHash', function(req, res) { 
	const blockHash = req.params.blockHash;
	const block = p2pServer.blockchain.getBlockByHash(blockHash);
	res.send(block);
});

app.get('/transaction/:transactionHash', function(req, res) {
	const transactionHash = req.params.transactionHash;
	const transactionData = p2pServer.blockchain.getTransactionByHash(transactionHash);
	res.json({
		transaction: transaction.transaction,
		block: transactionData.block
	});
});

// get address by address
app.get('/address/:address', function(req, res) {
	const address = req.params.address;
	const addressData = p2pServer.blockchain.getAddressData(address);
	res.json({
		transactions: addressData.transactions,
        state: addressData.state
	});
});

app.post('/transaction', function(req, res) {
    console.log("Transaction collected.");
    const transaction = new Transaction(req.body.value, req.body.to, req.body.fee, req.body.data, req.body.nonce, req.body.hash, req.body.signature);
    console.log(transaction);
    if (p2pServer.blockchain.verifyTransaction(transaction)) {
        p2pServer.blockchain.state.rollback();
        p2pServer.blockchain.addTransactionToTxPool(transaction);
        console.log("Transaction added.");
        p2pServer.broadcastTransaction(transaction);
        console.log("Transaction broadcast.");
        res.json({ note: 'Transaction broadcast successfully.' });
    } else {
        res.json({ note: 'Transaction discarded.' });
    }
    // res.redirect("/transaction");
});

try {
    const requestBlocksOptions = {
        url: `http://localhost:3001/block/${p2pServer.blockchain.chain.length + 1}/0`,
        method: 'GET',
        json: true
    };
    rp(requestBlocksOptions).then(blocks => {
        console.log('Syncing blocks...', blocks);
        p2pServer.blockchain.syncChain(blocks);
    });
    const requestViewOptions = {
        url: 'http://localhost:3001/view',
        method: 'GET',
        json: true
    };
    rp(requestViewOptions).then(data => {
        console.log('Syncing view...', data.view);
        p2pServer.pbft.updateView(data.view);
    });
} catch (error) {
    console.log(error);
}

app.listen(node.httpPort, function() {
    console.log(`Listening for http on port ${node.httpPort}...`)
});

p2pServer.listen();