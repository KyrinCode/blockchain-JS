```
receive tx
verify tx
add to txpool
```

```
receive block
verify and pre-execute block
    verify coinbase
    pre-execute coinbase
    for
        verify tx
        if false
            break
        pre-execute tx
if true
    pbft
    update block
    delete txs from txpool
else
    rollback block
```

```
create and pre-execute block
    packed[]
    create coinbase
    pre-execute coinbase
    packed.push(coinbase)
    capacity = blockSize - 1
    while capacity > 0 && i < txpool.length
        verify tx
        if true
            pre-execute tx
            packed.push(tx)
            capacity--
        i++
pbft
update block
delete txs from txpool
```