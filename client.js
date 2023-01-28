const rp = require('request-promise');
const Wallet = require('./dev/wallet');
// Wallet.create()

const id = process.argv[2];

userPrivateKeys = [
    '0x74f58e7dbe9d35f44be62b79deb4f52e9f026d7c53c0dc35d254c0d4231fbea2', // 0x6461f9fC6B44952EDAB4A168E247072605aF7cc4
    '0xffa3196442c256e72a24b119c8b6fa670cd7a9d687bdeb63f0ca0ea61e94cab4' // 0x8f2111bF00c6bA221Eb18E9A98230a038Fc2FC5A
]

const user = new Wallet(userPrivateKeys[id]);

let transaction = {
    value: 5,
    to: '0x8f2111bF00c6bA221Eb18E9A98230a038Fc2FC5A',
    fee: 1,
    data: {},
    nonce: 1,
}
// let transaction = {
//     value: 0,
//     to: '0x0',
//     fee: 1,
//     data: {
//         contract: 'Validator',
//         method: 'register',
//         content: {
//             httpPort: 3004, url: 'http://localhost:3004',
//             p2pPort: 5004, ws: 'ws://localhost:5004',
//             address: '0xf40cAA80ba7d40b67C282D794eE3715Ac036338f'
//         }
//     },
//     nonce: 1,
// }
transaction['hash'] = Wallet.hash(transaction);
transaction['signature'] = user.sign(transaction['hash']);

console.log(`From: ${user.address}`)
console.log(transaction)

const nodeUrl = 'http://localhost:3003';

const requestOptions = {
    url: nodeUrl + '/transaction',
    method: 'POST',
    body: transaction,
    json: true
};

rp(requestOptions).then(msg => {
    console.log("Response:", msg);
});