const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const rp = require('request-promise');
const port = process.argv[2];
const nodeUrl = process.argv[3];
const id = process.argv[4];

const Accounts = require('web3-eth-accounts');
const accounts = new Accounts()
nodePrivateKeys = [
    '0xcde9775a685f51565c4bb17cdb25e095c3647a21dd9fc6b2b59efe8d27384bac', // 0xd7EAc19Ae95011ec671f30BE2fC38084bB5650c8
    '0x7efa5673601e453f993d418cedfb21a95efc4db455a6be15b6bc97a714cb53c3', // 0x89758a9f224Be67B669A221e85251C85109a46B8
    '0x4f17a6b5c6afe30d80e367cc986b38ea390dafb6cb63bfbcbf1b0a6b5f508eb9' // 0x7216dd0e160729c202a58db1B021C721aA78D8F1
]
const node = accounts.privateKeyToAccount(nodePrivateKeys[id])

const LabChain = new Blockchain(nodeUrl, node.address);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/transaction', function(req, res) {
    const newTransaction = req.body;
    const blockIndex = LabChain.addTransactionToTxPool(newTransaction);
    res.json({ note: 'Transaction is pending.' });
});

// 交易应由client创建后直接作为body提交
app.post('/transaction/broadcast', function(req, res) {
    const newTransaction = LabChain.createNewTransaction(req.body.value, req.body.to, req.body.nonce, req.body.signature, req.body.transactionHash);
    LabChain.addTransactionToTxPool(newTransaction);

    const requestPromises = [];
    LabChain.networkNodes.forEach(networkNode => {
        const requestOptions = {
            url: networkNode.url + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(data => {
        res.json({ note: 'Transaction broadcast successfully.' });
    });
});

app.post('/mine', function(req, res) {
    const lastBlock = LabChain.getLastBlock();
    const previousBlockHash = lastBlock['hash'];

    let packedTxs = [];

    let coinbaseTx = {
        value: 10,
        to: node.address
    };
    const transactionHash = accounts.hashMessage(JSON.stringify(coinbaseTx))
    coinbaseTx['transactionHash'] = transactionHash

    // state1 <- state0
    // addressData1 <- addressData0

    LabChain.preExecuteCoinbaseTx(coinbaseTx);
    packedTxs.push(coinbaseTx);

    let i = 1
    while (i < LabChain.blockSize) {
        try {
            tx = LabChain.txPool.shift()
            if (LabChain.checkTxAndPreExecute(tx)){
                packedTxs.push(tx);
                i++;
            }
        } catch (err) {
            break;
        }
    }

    const currentBlockData = {
        transactions: packedTxs,
        index: lastBlock['index'] + 1
    };
    const nonce = LabChain.proofOfWork(previousBlockHash, currentBlockData);
    const blockHash = LabChain.hashBlock(previousBlockHash, currentBlockData, nonce);
    const newBlock = LabChain.createNewBlock(nonce, previousBlockHash, blockHash);

    const requestPromises = []
    LabChain.networkNodes.forEach(networkNode => {
        const requestOptions = {
            url: networkNode.url + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true
        };

        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises)
    .then(data => {
        res.json({
            note: "New block mined and broadcast successfully",
            block: newBlock
        });
    });
});

app.post('/receive-new-block', function(req, res) { // 验证并预执行新区块中交易更新state1，区块通过的话state0<-state1，不通过的话state1<-state0；将交易从txPool中拿掉
    const newBlock = req.body.newBlock;
    const lastBlock = LabChain.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];
    
    if (correctHash && correctIndex) {
        LabChain.chain.push(newBlock);
        LabChain.txPool = [];
        res.json({
            note: 'New block received and accepted.',
            newBlock: newBlock
        });
    } else {
        res.json({
            note: 'New block rejected.',
            newBlock: newBlock
        });
    }
});

app.post('/register-and-broadcast-node', function(req, res) {
    const newNode = req.body;
    // 遍历networkNodes中是否有url，有的话更新address，没有的话增加信息
    let i = 0;
    while (i < LabChain.networkNodes.length) {
        if (LabChain.networkNodes[i]['url'] == newNode.url) {
            LabChain.networkNodes[i]['address'] = newNode.address;
            break;
        }
    }
    if (i == LabChain.networkNodes.length && LabChain.node['url'] != newNode.url) LabChain.networkNodes.push(newNode);

    const regNodesPromises = [];
    LabChain.networkNodes.forEach(networkNode => {
        const requestOptions = {
            url: networkNode.url + '/register-node',
            method: 'POST',
            body: newNode,
            json: true
        };

        regNodesPromises.push(rp(requestOptions));
    });

    Promise.all(regNodesPromises)
    .then(data => {
        const bulkRegisterOptions = {
            url: newNode.url + '/register-nodes-bulk',
            method: 'POST',
            body: { allNetworkNodes: [ ...LabChain.networkNodes, LabChain.node ]},
            json: true
        };

        return rp(bulkRegisterOptions);
    })
    .then(data => {
        res.json({ note: 'New node registered with network successfully.' });
    });
});

app.post('/register-node', function(req, res) {
    const newNode = req.body;
    let i = 0;
    while (i < LabChain.networkNodes.length) {
        if (LabChain.networkNodes[i]['url'] == newNode.url) {
            LabChain.networkNodes[i]['address'] = newNode.address;
            break;
        }
    }
    if (i == LabChain.networkNodes.length && LabChain.node['url'] != newNode.url) LabChain.networkNodes.push(newNode);
    res.json({ note: 'New node registered successfully with node.' });
});

app.post('/register-nodes-bulk', function(req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNode => {
        let i = 0;
        while (i < LabChain.networkNodes.length) {
            if (LabChain.networkNodes[i]['url'] == networkNode.url) {
                LabChain.networkNodes[i]['address'] = networkNode.address;
                break;
            }
        }
        if (i == LabChain.networkNodes.length && LabChain.node['url'] != networkNode.url) LabChain.networkNodes.push(networkNode);
    });
    res.json({ note: 'Bulk registration successfully.' });
});

// app.get('/consensus', function(req, res) {
//     const requestPromises = [];
//     LabChain.networkNodes.forEach(networkNodeUrl => {
//         const requestOptions = {
//             url: networkNodeUrl + '/blockchain',
//             method: 'GET',
//             json: true
//         };

//         requestPromises.push(rp(requestOptions));
//     });

//     Promise.all(requestPromises)
//     .then(blockchains => {
//         const currentChainLength = LabChain.chain.length;
//         let maxChainLength = currentChainLength;
//         let newLongestChain = null;
//         let newTxPool  = null;

//         blockchains.forEach(blockchain => {
//             if (blockchain.chain.length > maxChainLength) {
//                 maxChainLength = blockchain.chain.length;
//                 newLongestChain = blockchain.chain;
//                 newTxPool = blockchain.txPool;
//             };
//         });

//         if (!newLongestChain || (newLongestChain && !LabChain.chainIsValid(newLongestChain))) {
//             res.json({
//                 note: 'Current chain has not been replaced.',
//                 chain: LabChain.chain
//             });
//         } else {
//             LabChain.chain = newLongestChain;
//             LabChain.txPool = newTxPool;
//             res.json({
//                 note: 'This chain has been replaced.',
//                 chain: LabChain.chain
//             })
//         }
//     });
// });

app.get('/blockchain', function(req, res) {
    res.send(LabChain);
});

app.get('/latestBlockHeight', function(req, res) {
    const latestBlockHeight = LabChain.chain.length;
    res.send(latestBlockHeight);
})

app.get('/sync/:end', function(req, res) {

    // 随机从节点池中发送获取-end请求 end为0的话默认同步到最后
    const r = Math.floor(Math.random() * LabChain.networkNodes.length);
    const requestOptions = {
        url: LabChain.networkNodes[r] + `/blocks/${LabChain.chain.length + 1}/${end}`,
        method: 'GET',
        json: true
    };

    // 验证新同步的区块并加入到区块链中
    rp(requestOptions)
    .then(blocks => {
        blocks.forEach(block => {
            if (LabChain.blockIsValid(block)) {
                LabChain.chain.push(block);
            } else {
                return `Block ${block['index']} is invalid.`;
            }
        });
    }).then(msg => {
        if (msg) {
            res.json({ note: msg });
        } else {
            res.json({ note: `Synced to ${LabChain.getLastBlock()['index']}th block.` });
        }
    });
});

app.get('/block/:start/:end', function(req, res) {
    if (end === 0) end = LabChain.chain.length - 1;
    const blocks = LabChain.chain[start - 1, end];
    res.send(blocks);
});

// get block by blockHash
app.get('/block/:blockHash', function(req, res) { 
	const blockHash = req.params.blockHash;
	const correctBlock = LabChain.getBlockByHash(blockHash);
	res.json({
		block: correctBlock
	});
});

// get transaction by transactionHash
app.get('/transaction/:transactionHash', function(req, res) {
	const transactionHash = req.params.transactionHash;
	const transactionData = LabChain.getTransactionByHash(transactionHash);
	res.json({
		transaction: transactionData.transaction,
		block: transactionData.block
	});
});

// get address by address
app.get('/address/:address', function(req, res) {
	const address = req.params.address;
	const addressData = LabChain.getAddressData(address);
	res.json({
		addressData: addressData
	});
});

app.get('/block-explorer', function(req, res) {
    res.sendFile('./block-explorer/index.html', { root: __dirname});
});

app.listen(port, function() {
    console.log(`Listening on port ${port}...`)
});