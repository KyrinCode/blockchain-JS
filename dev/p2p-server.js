const WebSocket = require("ws");

const MESSAGE_TYPE = {
    transaction: "TRANSACTION",
    prePrepare: "PRE_PREPARE",
    prepare: "PREPARE",
    commit: "COMMIT"
    // viewChange: "VIEW_CHANGE"
};

class P2pServer {
    constructor(
        blockchain,
        pbft,
        node,
        wallet
    ) {
        this.blockchain = blockchain;
        this.pbft = pbft;
        this.validator = node;
        this.validatorWallet = wallet;
        this.validators = [];
        this.sockets = [];
    }

    // 新节点加入时
    // 发送节点注册交易
    // 在app.js中syncChain后将其传入到p2p中函数给blockchain执行每个区块，然后syncView后将其传入到p2p中函数给pbft同步当前view
    // 最后开启listen监听

    listen() {
        const server = new WebSocket.Server({ port: node.p2pPort });
        server.on("connection", socket => {
            console.log("New connection <-");
            this.connectToValidator(socket);
            // 发给新节点type.view新节点收到type.view就updateView
        });
        this.validators = this.blockchain.state.getValidators();
        this.connectToValidators(); // connect to peers in the latest state after init
        console.log(`Listening for p2p connection on port ${node.p2pPort}...`);
    }

    connectToValidator(socket) {
        console.log("Socket connected ->");
        this.messageHandler(socket);
        this.sockets.push(socket);
        console.log(this.sockets.length);
    }

    connectToValidators() {
        this.validators.forEach(validator => {
            if (validator.address != this.validator.address){ // skip self
                const socket = new WebSocket(validator.ws);
                socket.addEventListener('error', (event) => {
                    console.log('WebSocket error: ', event);
                });
                socket.on("open", () => this.connectToValidator(socket));
            }
        });
    }

    updateValidators() { // only update this.validators, waiting for connection from new node
        // check if new validator
        const validators = this.blockchain.state.getValidators();
        if (this.validators.length < validators.length) {
            this.validators = validators;
        }
    }

    getLeader() {
        return this.validators[this.pbft.view % this.validators.length];
    }

    broadcastTransaction(transaction) {
        console.log(this.sockets.length);
        this.sockets.forEach(socket => {
            this.sendTransaction(socket, transaction);
        });
    }

    sendTransaction(socket, transaction) {
        socket.send(
            JSON.stringify({
                type: MESSAGE_TYPE.transaction,
                transaction: transaction
            })
        );
    }

    broadcastPrePrepare(block) {
        this.sockets.forEach(socket => {
            this.sendPrePrepare(socket, block);
        });
    }

    sendPrePrepare(socket, block) {
        socket.send(
            JSON.stringify({
                type: MESSAGE_TYPE.prePrepare,
                block: block
            })
        );
    }

    broadcastPrepare(prepare) {
        this.sockets.forEach(socket => {
            this.sendPrepare(socket, prepare);
        });
    }

    sendPrepare(socket, prepare) {
        socket.send(
            JSON.stringify({
                type: MESSAGE_TYPE.prepare,
                prepare: prepare
            })
        );
    }

    broadcastCommit(commit) {
        this.sockets.forEach(socket => {
            this.sendCommit(socket, commit);
        });
    }

    sendCommit(socket, commit) {
        socket.send(
            JSON.stringify({
                type: MESSAGE_TYPE.commit,
                commit: commit
            })
        );
    }

    // broadcastViewChange(viewChange) {
    //     this.sockets.forEach(socket => {
    //         this.sendViewChange(socket, viewChange);
    //     });
    // }

    // sendViewChange(socket, viewChange) {
    //     socket.send(
    //         JSON.stringify({
    //             type: MESSAGE_TYPE.viewChange,
    //             viewChange: viewChange
    //         })
    //     );
    // }

    messageHandler(socket) {
        socket.on("message", message => {
            const data = JSON.parse(message);
            console.log("RECEIVED", data.type);
    
            switch (data.type) {
                case MESSAGE_TYPE.transaction:
                    if (
                        !this.blockchain.inTxPool(data.transaction) &&
                        this.blockchain.verifyTransaction(data.transaction)
                    ) {
                        this.blockchain.state.rollback();
                        this.blockchain.addTransactionToTxPool(data.transaction);
                        console.log("Transaction added.");
                        this.broadcastTransaction(data.transaction);
                        console.log("Transaction broadcast.");
                    }
                    // create block
                    if (
                        this.getLeader().address == this.validator.address &&
                        Date.now() > this.blockchain.getLastBlock().block.timestamp + 60000 &&
                        this.blockchain.txPool.length > 0 &&
                        this.pbft.phase == 'committed'
                    ) {
                        console.log("Creating block...");
                        const block = this.blockchain.createAndPreExecuteBlock(this.validatorWallet);
                        console.log("Block created:", block);

                        console.log("PBFT START");

                        this.pbft.addToPrePrepare(block);
                        console.log("Pre-prepare added.");
                        this.broadcastPrePrepare(block);
                        console.log("Pre-prepare broadcast.");

                        console.log("Creating prepare...");
                        const prepare = this.pbft.createPrepare(block.hash, this.validatorWallet);
                        console.log("Prepare created:", prepare);
                        this.pbft.addToPrepare(prepare);
                        console.log("Prepare added.");
                        this.broadcastPrepare(prepare);
                        console.log("Prepare broadcast.");

                        this.pbft.switchPhase('prepare');
                    }
                    // view change
                    // if (
                    //     this.getLeader().address != this.validator.address &&
                    //     Date.now() > this.blockchain.getLastBlock().block.timestamp + 90 &&
                    //     this.blockchain.txPool.length > 0
                    // ) {
                    //     const newView = (Date.now() - this.blockchain.getLastBlock().block.timestamp) % 30;
                    //     this.pbft.createViewChange
                    //     this.pbft.addToViewChange
                    //     this.pbft.broadcastViewChange
                    // }
                    break;
                case MESSAGE_TYPE.prePrepare:
                    if (
                        !this.pbft.inPrePrepare(data.block.hash) &&
                        this.getLeader().address == data.block.validator && // verify leader here
                        this.blockchain.verifyAndPreExecuteBlock(data.block)
                    ) {
                        this.pbft.addToPrePrepare(data.block);
                        console.log("Pre-prepare added.");
                        this.broadcastPrePrepare(data.block);
                        console.log("Pre-prepare broadcast.");
            
                        console.log("Creating prepare...");
                        const prepare = this.pbft.createPrepare(data.block.hash, this.validatorWallet);
                        console.log("Prepare created:", prepare);
                        // this.pbft.addToPrepare(prepare);
                        // console.log("Prepare added.");
                        this.broadcastPrepare(prepare);
                        console.log("Prepare broadcast.");

                        this.pbft.switchPhase('prepare');
                    }
                    break;
                case MESSAGE_TYPE.prepare:
                    if (
                        !this.pbft.inPrepare(data.prepare) &&
                        this.pbft.verifyPrepare(data.prepare) &&
                        this.blockchain.isValidator(data.prepare.validatorAddress)
                    ) {
                        this.pbft.addToPrepare(data.prepare);
                        console.log("Prepare added.");
                        this.broadcastPrepare(data.prepare);
                        console.log("Prepare broadcast.");

                        if (
                            this.pbft.prepare[data.prepare.blockHash].length > this.validators.length * 2 / 3 &&
                            this.pbft.phase == 'prepare'
                        ) {
                            console.log("Creating commit...");
                            const commit = this.pbft.createCommit(data.prepare.blockHash, this.validatorWallet);
                            console.log("Commit created:", commit);
                            // this.pbft.addToCommit(commit);
                            // console.log("Commit added.");
                            this.broadcastCommit(commit);
                            console.log("Commit broadcast.");

                            this.pbft.switchPhase('commit');
                        }
                    }
                    break;
                case MESSAGE_TYPE.commit:
                    if (
                        !this.pbft.inCommit(data.commit) &&
                        this.pbft.verifyCommit(data.commit) &&
                        this.blockchain.isValidator(data.commit.validatorAddress)
                    ) {
                        this.pbft.addToCommit(data.commit);
                        console.log("Commit added.");
                        this.broadcastCommit(data.commit);
                        console.log("Commit broadcast.");

                        if (
                            this.pbft.commit[data.commit.blockHash].length > this.validators.length * 2 / 3 &&
                            this.pbft.phase == 'commit'
                        ) {
                            let block = this.pbft.getBlock(data.commit.blockHash);
                            this.pbft.commit[data.commit.blockHash].forEach(c => {
                                const commitMessage = {
                                    validator: c.validatorAddress,
                                    signature: c.signature
                                };
                                block.commitMessages.push(commitMessage);
                            });
                            console.log("block:", block);
                            this.blockchain.updateBlock(block);
                            this.updateValidators();
                            this.pbft.changeView();
                            this.blockchain.deleteTransactionsFromTxPool(block.transactions);
                            // clear pbft blockHash
                            // this.pbft.delete(data.commit.blockHash)

                            this.pbft.switchPhase('committed');
                        }
                    }
                    break;
                
                // 视图切换
                // case MESSAGE_TYPE.viewChange:
                //     if (
                //         !this.pbft.inViewChange(data.viewChange) && // not exist
                //         this.pbft.verifyViewChange(data.viewChange) && // signature and view
                //         this.blockchain.getLastBlock().block.hash == data.viewChange.blockHash && // latest blockHash
                //         this.blockchain.isValidator(data.viewChange.validatorAddress) && // is validator
                //         Date.now() > this.blockchain.getLastBlock(),block.timestamp + 90 && // overtime
                //         this.blockchain.txPool.length > 0 // has tx
                //     ) {
                //         this.pbft.addToViewChange(data.viewChange);
                //         console.log("viewChange added.");
                //         this.broadcastViewChange(data.viewChange);
                //         console.log("viewChange broadcast.");

                //         if (this.pbft.viewChange[data.viewChange.blockHash].length > this.validators.length * 2 / 3) {
                //             this.pbft.changeView
                //             this.pbft.switchPhase('view-change');
                //             // if leader
                //             if (this.getLeader() == this.validator.address) {
                //                 console.log("Creating block...");
                //                 const block = this.blockchain.createAndPreExecuteBlock(this.validatorWallet);
                //                 console.log("Block created:", block);

                //                 console.log("PBFT START");

                //                 this.pbft.addToPrePrepare(block);
                //                 console.log("Pre-prepare added.");
                //                 this.broadcastPrePrepare(block);
                //                 console.log("Pre-prepare broadcast.");

                //                 console.log("Creating prepare...");
                //                 const prepare = this.pbft.createPrepare(block.hash, this.validatorWallet);
                //                 console.log("Prepare created:", prepare);
                //                 this.pbft.addToPrepare(prepare);
                //                 console.log("Prepare added.");
                //                 this.broadcastPrepare(prepare);
                //                 console.log("Prepare broadcast.");

                //                 this.pbft.switchPhase('prepare');
                //             }
                //         }
                //     }
                //     break;
            }
        });
    }
}

module.exports = P2pServer;