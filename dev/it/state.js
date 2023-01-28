class State {
    constructor() {
        this.state0 = {};
        this.state1 = {};
    }

    get(address) {
        if (this.state0[address] == undefined) {
            return 0;
        } else {
            return this.state0[address];
        }
    }

    increment(address, value) {
        if (value == 0) return;
        // check existence
        if (this.state1[address] == undefined) {
            this.state1[address] = {
                balance: 0,
                nonce: 0
            };
        }
        this.state1[address].balance += value;
    }

    decrement(address, value) {
        if (value == 0) return;
        this.state1[address].balance -= value;
        return true;
    }

    transfer(from, to, value, validatorAddress, fee) {
        this.decrement(from, value + fee);
        this.increment(to, value);
        this.increment(validatorAddress, fee);
        this.state1[from].nonce++;
    }

    getValidators() {
        return this.state0['Validator'];
    }

    registerValidator(validator) {
        if (this.state1['Validator'] == undefined) {
            this.state1['Validator'] = [];
        }
        this.state1['Validator'].push(validator);
    }

    rollback() {
        this.state1 = JSON.parse(JSON.stringify(this.state0));
    }

    update() {
        this.state0 = JSON.parse(JSON.stringify(this.state1));
    }
}

module.exports = State;