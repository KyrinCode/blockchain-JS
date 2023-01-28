const Wallet = require('../wallet');

class Block {
    constructor(
        prevHash,
        transactions,
        wallet, // validator wallet
    ) {
        this.prevHash = prevHash;
        this.timestamp = Date.now();
        this.transactions = transactions;
        this.validator = wallet.address; // validator address
        const block = { timestamp: this.timestamp, prevHash: this.prevHash, transactions: this.transactions, validator: this.validator };
        this.hash = Wallet.hash(block);
        this.signature = wallet.sign(this.hash);
        this.commitMessages = [];
    }

    static genesis() {
        const genesisBlock = {
            timestamp: 1672502400000,
            data: "LabChain genesis.",
            hash: '0',
        }
        return genesisBlock;
    }
}

module.exports = Block;