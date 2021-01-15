import { map, collect } from 'https://cdn.jsdelivr.net/npm/streaming-iterables@5.0.3/dist/index.mjs'
import { log, AsyncFunction, AsyncGeneratorFunction, GeneratorFunction, generateUUID } from './utils.js'
import { cloneDeep, msgpack, PeerId, libp2pNoise, libp2pMplex, itPipe, datastoreLevel, libp2p, libp2pWebrtcStar, cryptoKeys, events } from './dep.js'

const transportClassName = libp2pWebrtcStar.prototype[Symbol.toStringTag]
const encode = msgpack.encode
const decode = (bufferList) => msgpack.decode(bufferList.copy())


class UserNode extends events.EventEmitter {
  constructor(db, username, signallingServer, simplePeerOptions, mode='worldly') {
    super()
    this.db = db
    this.username = username
    this.signallingServer = signallingServer
    this.simplePeerOptions = simplePeerOptions
    this.mode = mode
    this.connectionBook = new Map()
  }

  async init(optionFilter=item=>item) {
    this.node = await this.createLibp2pNode(this.signallingServer, this.simplePeerOptions, optionFilter)
    this.addEventListener()
    this.id = this.node.peerId.toB58String()
    log(`success create node with id ${this.id}`)
    this.saveId()
  }

  async pipe(messages, stream, responseHandler, pipeEndHandler) {
    await itPipe(
      messages,
      source => map(encode, source),
      stream.sink
    )

    let end = false
    while (!end) {
      const [response] = await itPipe(
        stream.source,
        source => map(decode, source),
        collect
      )

      if (response === 'THE END') {
        end = true
        pipeEndHandler()
      } else {
        responseHandler(response)
      }
    }
  }

  async vegetative() {
    if (!this.node.isStarted()) {
      return
    }
    await this.node.stop()
    this.emit('vegetative')
  }

  async awake() {
    if (this.node.isStarted()) {
      return
    }

    if (this.mode === 'unworldly') {
      return
    }

    await this.node.start()
    this.emit('awake')
  }

  async getStreamByConnectionProtocol(connection, protocol) {
    let stream
    const id = connection.remotePeer.toB58String()
    try {
      stream = await connection.newStream(protocol);
    } catch (error) {
      log(`offline ${id} throw dial error: ${error}`)
      this.emit('user:offline', id)
      this.connectionBook.delete(id)
      throw error
    }
    stream = await stream.stream;
    return stream;
  }

  async getConnectionById(id) {
    let connection = this.connectionBook.get(id)
    
    if (connection) {
      return connection
    }
    
    try {
      connection = await this.node.dial(PeerId.createFromB58String(id), { spOptions: this.simplePeerOptions })
    } catch (error) {
      log(`offline ${id} throw dial error: ${error}`)
      this.emit('user:offline', id)
      throw error
    }
    this.connectionBook.set(id, connection)
    return connection
  }

  async pingPeer(id) {
    try {
      await this.node.ping(PeerId.createFromB58String(id))
    } catch (error) {
      log(`offline ${id} throw ping error: ${error}`)
      this.emit('user:offline', id)
    }
  }

  addEventListener() {
    this.node.on('peer:discovery', async (peerId) => {
      const id = peerId.toB58String()
      log(`peer:discovery hi ${id}`)
      this.emit('user:hi', id)
      await this.pingPeer(id)
    })
    
    this.node.connectionManager.on('peer:connect', (connection) => {
      const id = connection.remotePeer.toB58String()
      log(`peer:connect online ${id}`)
      this.emit('user:online', id)
    })
  }

  createProtocolHandler(action, soul, exec, UUIDNameSpace) {
    return async ({ connection, stream, protocol }) => {
      const id = connection.remotePeer.toB58String()
      const requestHandler = async ([username, topic, meta, ...args]) => {
        if (!meta.uuid) {
          meta.uuid = generateUUID(UUIDNameSpace)
        }

        this.emit('handle:request', cloneDeep({
          username,
          topic,
          receiver: this.id,
          request: { action: protocol, args },
          sender: id,
        }))

        let status = 0
        let results
        let generator
        const emitThenPipe = async () => {
          this.emit('handle:response', cloneDeep({
            topic,
            sender: this.id,
            username: this.username,
            receiver: id,
            response: { status, results }
          }))

          await itPipe(
            [[this.username, status, results]],
            source => map(encode, source),
            stream.sink
          )
        }

        try {
          const di = { connection, stream, id, username, topic, soul, exec, meta }

          if (action instanceof AsyncGeneratorFunction || action instanceof GeneratorFunction) {
            generator = action(di, ...args)
          } else if (action instanceof AsyncFunction) {
            generator = (async function* () { yield await action(di, ...args) })()
          } else {
            generator = (function* () { yield  action(di, ...args) })()
          }

          for await (const item of generator) {
            results = item === undefined ? null : item
            await emitThenPipe()
          }
        } catch(error) {
          log(`handler error: ${error}`)
          status = 1
          results = error.toString()
          await emitThenPipe()
        } finally {
          await itPipe(
            ['THE END'],
            source => map(encode, source),
            stream.sink
          )
        }
      }
      const [request] = await itPipe(
        stream.source,
        source => map(decode, source),
        collect
      )
      await requestHandler(request)
    }
  }

  async getPeerId() {
    let id;

    try {
      id = await this.db.get('id');
    } catch (error) {
      log(`get id from db error: ${error}`);
    }

    let peerId;

    if (id) {
      const peerPrivateKey = await this.db.get('peerPrivateKey')
      peerId = PeerId.createFromB58String(id)
      peerId.privKey = await cryptoKeys.import(peerPrivateKey, this.username)
    }

    return peerId
  }

  async createLibp2pNode(signallingServer, simplePeerOptions, optionFilter) {
    return await libp2p.create(optionFilter({
      addresses: {listen: [signallingServer]},
      modules: {
        transport: [libp2pWebrtcStar],
        connEncryption: [libp2pNoise.NOISE],
        streamMuxer: [libp2pMplex],
      },
      config: {
        peerDiscovery: {autoDial: false},
        transport: {
          [transportClassName]: {
            listenerOptions: simplePeerOptions
          }
        }
      },
      datastore: new datastoreLevel(`${this.username}/libp2p`, { prefix: '' }),
      peerStore: {
        persistence: true,
        threshold: 1
      },
      peerId: await this.getPeerId(),
    }))
  }

  async saveId() {
    await this.db.put('id', this.id);
    await this.db.put('peerPrivateKey', await this.node.peerId.privKey.export(this.username));
  }

  installHandler(protocol, handler) {
    this.node.handle(protocol, handler)
  }
}

export default UserNode
