const Accounts = require('web3-eth-accounts');
const accounts = new Accounts();

class Wallet {
    constructor(privateKey) {
        // this.account = accounts.privateKeyToAccount(privateKey);
        this.privateKey = privateKey;
        this.address = accounts.privateKeyToAccount(privateKey).address;
    }

    sign(message) {
        const signature = accounts.sign(JSON.stringify(message), this.privateKey).signature;
        return signature;
    }

    static recover(message, signature) {
        const from = accounts.recover(JSON.stringify(message), signature);
        return from;
    }

    static hash(message) {
        const hash = accounts.hashMessage(JSON.stringify(message));
        return hash;
    }

    static create() {
        console.log(accounts.create());
    }
}

module.exports = Wallet;