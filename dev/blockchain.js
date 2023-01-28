const Wallet = require('./wallet');
const Block = require('./it/block');
const Transaction = require('./it/transaction');
const State = require('./it/state');
// const Node = require('./it/node');

function Blockchain() {
    this.chain = [Block.genesis()];
    this.txPool = [];
    this.blockSize = 1024;
    this.state = new State();
    // init state
    this.state.registerValidator({
        httpPort: 3001, url: 'http://localhost:3001',
        p2pPort: 5001, ws: 'ws://localhost:5001',
        address: '0xd7EAc19Ae95011ec671f30BE2fC38084bB5650c8'
    });
    this.state.registerValidator({
        httpPort: 3002, url: 'http://localhost:3002',
        p2pPort: 5002, ws: 'ws://localhost:5002',
        address: '0x89758a9f224Be67B669A221e85251C85109a46B8'
    });
    this.state.registerValidator({
        httpPort: 3003, url: 'http://localhost:3003',
        p2pPort: 5003, ws: 'ws://localhost:5003',
        address: '0x7216dd0e160729c202a58db1B021C721aA78D8F1'
    });
    // this.state.registerValidator({
    //     httpPort: 3004, url: 'http://localhost:3004',
    //     p2pPort: 5004, ws: 'ws://localhost:5004',
    //     address: '0xf40cAA80ba7d40b67C282D794eE3715Ac036338f'
    // });
    this.state.increment('0xd7EAc19Ae95011ec671f30BE2fC38084bB5650c8', 100);
    this.state.increment('0x89758a9f224Be67B669A221e85251C85109a46B8', 100);
    this.state.increment('0x7216dd0e160729c202a58db1B021C721aA78D8F1', 100);
    this.state.increment('0xf40cAA80ba7d40b67C282D794eE3715Ac036338f', 100);
    this.state.increment('0x6461f9fC6B44952EDAB4A168E247072605aF7cc4', 100); // user
    this.state.increment('0x8f2111bF00c6bA221Eb18E9A98230a038Fc2FC5A', 100); // user
    this.state.update();

    // easy for indexing address data
    // this.addressData = [{}, {}];

    // this.validator = node;
    // this.leader = this.viewChange();
}

Blockchain.prototype.getLastBlock = function() {
    const lastBlock = {
        blockHeight: this.chain.length,
        block: this.chain[this.chain.length - 1]
    }
    return lastBlock;
}

// receive tx -> verify tx -> add tx to txpool

Blockchain.prototype.verifyTransaction = function(transaction) { // when receiving
    // hash and signature
    const tx = {
        value: transaction.value,
        to: transaction.to,
        fee: transaction.fee,
        data: transaction.data,
        nonce: transaction.nonce
    };
    if (transaction.hash != Wallet.hash(tx)) return false;
    const from = Wallet.recover(transaction.hash, transaction.signature)
    // balance and nonce
    const fromState = this.state.get(from);
    if (fromState.balance < transaction.value + transaction.fee || transaction.nonce != fromState.nonce + 1) return false;
    return true;
}

Blockchain.prototype.preExecuteTransaction = function(transaction, validatorAddress) { // when packing or receiving block after verifyTransaction
    const from = Wallet.recover(transaction.hash, transaction.signature)
    this.state.transfer(from, transaction.to, transaction.value, validatorAddress, transaction.fee);

    // this.addressData
    // manage validators
    if (transaction.to == '0x0' && transaction.data.contract == 'Validator') {
        if (transaction.data.method == 'register') {
            this.state.registerValidator(transaction.data.content);
        }
    }
}

Blockchain.prototype.addTransactionToTxPool = function(transaction) { // if verifyTransaction true
    this.txPool.push(transaction);
}

// receive block -> verify block -> pbft -> execute block -> delete txs from txpool
//                               -> rollback block

Blockchain.prototype.verifyAndPreExecuteBlock = function(block) {
    // leader 不在这里验证

    // prevHash
    const prevBlock = this.getLastBlock().block;
    // hash
    if (prevBlock.hash != block.prevHash) return false;
    if (Wallet.hash({ timestamp: block.timestamp, prevHash: block.prevHash, transactions: block.transactions, validator: block.validator }) != block.hash) return false;
    // signature
    if (Wallet.recover(block.hash, block.signature) != block.validator) return false;
    // transactions
    this.state.rollback();
    for (let i = 0; i < block.transactions.length; i++) {
        if (i == 0) {
            if (this.verifyCoinbaseTransaction(block.transactions[i], block.validator)) {
                this.preExecuteCoinbaseTransaction(block.transactions[i]);
            } else {
                this.state.rollback();
                return false;
            }
        } else {
            if (this.verifyTransaction(block.transactions[i])) {
                this.preExecuteTransaction(block.transactions[i], block.validator);
            } else {
                console.log("?")
                this.state.rollback();
                return false;
            }
        }
    }
    return true;
}

Blockchain.prototype.verifyCoinbaseTransaction = function(coinbaseTransaction, validatorAddress) {
    if (coinbaseTransaction.value != 5 || coinbaseTransaction.to != validatorAddress) return false;
    return true;
}

Blockchain.prototype.preExecuteCoinbaseTransaction = function(coinbaseTransaction) {
    this.state.increment(coinbaseTransaction.to, coinbaseTransaction.value);
    // this.addressData
}

Blockchain.prototype.updateBlock = function(block) {
    if (this.verifyAndPreExecuteBlock(block) == true) {
        // add prepareMessages commitMessages
        this.chain.push(block);
        this.state.update();
        // this.viewChange();
    }
}

Blockchain.prototype.getLeader = function(view) {
    validators = this.state.getValidators();
    leader = validators[view % validators.length];
    return this.leader;
}

// Blockchain.prototype.viewChange = function(view) {
//     validators = this.state.getValidators();
//     this.leader = validators[view % validators.length];
// }

Blockchain.prototype.deleteTransactionsFromTxPool = function(transactions) {
    transactions.forEach(transaction => {
        this.txPool.map((val, i) => {
            if (val.hash == transaction.hash) {
                this.txPool.splice(i, 1);
            }
        });
    });
}

Blockchain.prototype.inTxPool = function(transaction) {
    const exist = this.txPool.find(t => t.hash == transaction.hash);
    if (exist) return true;
    return false;
}

// Blockchain.prototype.rollbackBlock = function(block) {
//     // if verifyBlock return false
//     this.state.rollback();
// }

// create block -> pbft -> execute block -> delete txs from block

Blockchain.prototype.createAndPreExecuteBlock = function(wallet) {
    let packed = [];
    const coinbaseTransaction = Transaction.coinbase(node.address);
    this.preExecuteCoinbaseTransaction(coinbaseTransaction);
    packed.push(coinbaseTransaction);
    capacity = this.blockSize - 1;
    let i = 0;
    while (capacity > 0 && i < this.txPool.length) {
        const transaction = this.txPool[i];
        if (this.verifyTransaction(transaction)) {
            this.preExecuteTransaction(transaction);
            packed.push(transaction);
            capacity--;
        }
        i++;
    }
    block = new Block(this.getLastBlock().block.hash, packed, wallet);
    return block;
}

Blockchain.prototype.isValidator = function(validatorAddress) {
    const validators = this.state.getValidators();
    if (validators.find(validator => validator.address == validatorAddress)) return true;
    return false;
}

// app.js
// block/2/0 获得第2至latest区块 -> this.syncChain -> app.js syncView传到p2p -> listen connect peers
// sendChain

// from current height verifyBlock and executeBlock to reconstruct state
Blockchain.prototype.syncChain = function(blocks) {
    blocks.forEach(block => {
        // check commit > threshold
        validatorAddresses = [];
        this.state.getValidators().forEach(validator => {
            validatorAddresses.push(validator.address);
        });
        let s = new Set();

        block.commitMessages.forEach(commit => {
            if (
                validatorAddresses.indexOf(commit.validator) != -1 &&
                Wallet.recover(block.hash, commit.signature) == commit.validator
            ) {
                s.add(commit.validator);
            }
        });
        if (s.size > validatorAddresses.length * 2 / 3){
            this.updateBlock(block);
        }
    });
};

Blockchain.prototype.getBlockByHash = function(blockHash) {
	let block = null;
	this.chain.forEach(b => {
		if (b.hash === blockHash) block = b;
	});
	return block;
};


Blockchain.prototype.getTransactionByHash = function(transactionHash) {
	let transaction = null;
	let block = null;

	this.chain.forEach(b => {
		b.transactions.forEach(t => {
			if (t.hash === transactionHash) {
				transaction = t;
				block = b;
			};
		});
	});

	return {
		transaction: transaction,
		block: block
	};
};

Blockchain.prototype.getAddressData = function(address) {
	const transactions = [];
	this.chain.forEach(block => {
		block.transactions.forEach(transaction => {
			if(transaction.to == address || Wallet.recover(transaction.hash, transaction.signature) == address) {
				transactions.push(transaction);
			};
		});
	});

	const state = this.state.get(address);

	return {
		transactions: transactions,
		state: state
	};
};


module.exports = Blockchain;