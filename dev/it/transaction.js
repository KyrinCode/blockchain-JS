const Wallet = require('../wallet');

class Transaction {
    constructor(
        value,
        to, // if to is 0x0, data is interpreted
        fee,
        data, // { contract: 'Validator', method: 'register', content: {httpPort: 3001, url: 'http://localhost:3001', p2pPort: 5001, ws: 'ws://localhost:5001', address: '0xAB'} }
        nonce,
        hash,
        signature
    ) {
        this.value = value;
        this.to = to;
        this.fee = fee;
        this.data = data;
        this.nonce = nonce;
        this.hash = hash;
        this.signature = signature;
    }

    static create(value, to, fee, data, nonce, wallet) {
        const tx = { value: value, to: to, fee: fee, data: data, nonce: nonce };
        const hash = Wallet.hash(tx);
        const signature = wallet.sign(hash);
        const transaction = new this(value, to, fee, data, nonce, hash, signature);
        return transaction;
    }

    static coinbase(to) {
        let coinbaseTransaction = {
            value: 5,
            to: to
        }
        coinbaseTransaction['hash'] = Wallet.hash(coinbaseTransaction);
        return coinbaseTransaction;
    }    
}

module.exports = Transaction;