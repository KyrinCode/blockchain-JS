# blockchain-JS
 A blockchain prototype based on PBFT consensus and account model.

+ PBFT consensus
+ Account-based model
+ Register new validators
+ Http endpoint with port 300X
+ P2P connection with port 500X

1. start 3 nodes

```sh
npm run node_1
npm run node_2
npm run node_3
```

2. use client to test transfer

modify client to send transfer tx

```sh
node client.js 0
```

3. start 4th node

```sh
npm run node_4
```

4. use client to test validator registration

modify client to send validator registration tx

```sh
node client.js 1
```

review dev/app.js to try some other functions with get/post requests