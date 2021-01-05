import { log, AsyncFunction, AsyncGeneratorFunction, GeneratorFunction } from "./utils.js"
import { collect } from 'https://cdn.jsdelivr.net/npm/streaming-iterables@5.0.3/dist/index.mjs'
import { ActionHelper, proxyHandler} from "./action-helper.js"
import ActionResponse from './action-response.js'
import { itPipe, events, cloneDeep } from "./dep.js"

class Shell extends events.EventEmitter{
  constructor(userNode, soul) {
    super()
    this.soul = soul
    this.userNode = userNode
    this.addEventListener()
    this.soul.addEventListener(this)
  }

  addEventListener() {
    this.userNode.on('handle:request', data => this.emit('action:request', data))
    this.userNode.on('handle:response', data => this.emit('action:response', data))
  }

  ensureAction({ topic='topic', receivers=[], action='/Ping', args=[], meta={} }) {
    return {topic, receivers, action, args, meta}
  }

  async exec(action) {
    // if action is helper or other args contains none `simple type` data
    action = JSON.parse(JSON.stringify(action))

    const response = new ActionResponse(action)
    for await (const item of this.execGenerator(this.ensureAction(action))) {
      response.add(item)
    }

    // summarize action experiences
    try {
      await this.soul.summarize()
    } catch (error) {
      log(`summarize action experiences error: ${error}`)
    } finally {
      return response
    }
  }

  execGenerator({ topic, receivers, action, args, meta }, pipe=false) {
    if (!receivers.length) {
      return this.applyAction(topic, action, args, pipe, meta)
    } else {
      return this.rpc(topic, receivers, action, args, pipe, meta)
    }
  }

  createPipeExecGenerator(action) {
    async function* wrapper(preActionResponses) {
      for await (const item of preActionResponses) {
        const nextAction = cloneDeep(action)

        if (!item.response.results.ignore) {
          let preActionResults = [item.response.results]

          if (nextAction.meta.flatPreActionResults) {
            preActionResults = preActionResults.flat()
          }

          nextAction.args = nextAction.args.concat(preActionResults)
        }

        for await (const item of this.execGenerator(nextAction, true)) {
          yield item
        }
      }
    }
    return wrapper.bind(this)
  }

  async getStream(id, action) {
    let connection = await this.userNode.getConnectionById(id)

    try {
      return await this.userNode.getStreamByConnectionProtocol(connection, action)
    } catch (error) {
      if (error.code === 'ERR_UNSUPPORTED_PROTOCOL') {
        throw error
      }
      log(`connection maybe closed, get stream error: ${error}`)
      await this.userNode.getConnectionById(id)
      return await this.getStream(id, action)
    }
  }

  async *rpc(topic, receivers, action, args, pipe, meta) {
    const id = this.userNode.id
    const username = this.userNode.username

    for (const receiver of receivers) {
      const stream = await this.getStream(receiver, action)

      if (!pipe) {
        this.emit('action:request', cloneDeep({
          topic,
          receiver: receiver,
          request: {action, args},
          sender: id,
          username
        }))
      }

      const [remoteUser, status, results] = await this.userNode.pipe([username, topic, meta].concat(args), stream)

      for (const result of results) {
        const response = {
          topic,
          sender: receiver,
          username: remoteUser,
          receiver: id,
          response: {status, results: result}
        }

        yield response
        if (!pipe) {
          this.emit('action:response', cloneDeep(response))
        }
      }
    }
  }

  async *applyAction(topic, action, args, pipe, meta) {
    const id = this.userNode.id
    const username = this.userNode.username

    if (!pipe) {
      this.emit('action:request', cloneDeep({
        topic,
        receiver: id,
        request: {action, args},
        sender: id,
        username: username
      }))
    }

    let status = 0
    let generator

    const response = {
      topic,
      sender: id,
      username: username,
      receiver: id,
      response: { status }
    }

    try {
      const func = this['action' + action.slice(1)]
      const di = { topic, soul: this.soul, exec: this.exec.bind(this), meta }

      if (func instanceof AsyncGeneratorFunction || func instanceof GeneratorFunction) {
        generator = func.apply(this, [di, ...args])
      } else if (func instanceof AsyncFunction) {
        generator = (async function* (self) { yield await func.apply(self, [di, ...args]) })(this)
      } else if (func instanceof Function) {
        generator = (function* (self) { yield func.apply(self, [di, ...args]) })(this)
      } else {
        throw `${action} action not supported in the shell`
      }

      for await (const item of generator) {
        if (item === undefined) {
          response.response.results = null
        } else {
          response.response.results = item
        }

        yield cloneDeep(response)

        if (!pipe) {
          this.emit('action:response', cloneDeep(response))
        }
      }
    } catch(error) {
      response.response.status = 1
      response.response.results = error.toString()

      yield response
      if (!pipe) {
        this.emit('action:response', cloneDeep(response))
      }
    }
  }

  install() {
    Object.getOwnPropertyNames(Shell.prototype).filter(name =>
      name.startsWith('action') && name.length > 'action'.length && typeof this[name] === 'function'
    ).map(action =>
      ['/' + action.slice('action'.length), this[action].bind(this)]
    ).forEach(([protocol, action]) =>
      this.installRemoteAction(protocol, action)
    )
  }

  installExternalAction(action) {
    let actionName = action.name
    const first = actionName[0]

    if (first !== first.toUpperCase()) {
      log(`[WARN] install external action(${action.name}) first letter is not upper case, auto correct!`)
      actionName = first.toUpperCase() + actionName.slice(1)
    }

    Shell.prototype[`action${actionName}`] = action.bind(this)
    this.installRemoteAction(`/${actionName}`, action.bind(this))
  }

  async installModule(...pathes) {
    for (const path of pathes) {
      try {
        const {default: actions} = await import(path)
        actions.filter(action => typeof action === 'function').forEach(action => this.installExternalAction(action))
        log(`install module(${path}) success`)
      } catch (error) {
        log(`install module(${path}) error: ${error}`)
      }
    }
  }

  installRemoteAction(protocol, action) {
    this.userNode.installHandler(protocol, this.userNode.createProtocolHandler(action, this.soul, this.exec.bind(this)))
  }

  /* built-in action */

  /**
   * Ping
   * @returns {string} pong
   */
  actionPing() {
    return 'pong'
  }

  /**
   * Show the username
   *  Note: this example use `object` type as action argument payload, so that client can pass keyword args
   *
   * @param meta -
   *  If this is a remote action call, meta contains { connection, stream, id, username, topic, soul, meta }
   *  If this is a local action call, meta contains { topic, soul, meta }
   *
   *  Note: the inner `meta` is for runtime control, current contains:
   *    - flatPreActionResults
   * @param help - Show help message
   * @param version - Show version message
   * @return {string} The username
   */
  actionWhoami(meta, {help, version}={}) {
    if (help) {
      return 'show the username related to the peer id'
    } else if (version){
      return '1.0.0'
    } else {
      return this.userNode.username
    }
  }

  /**
   * Echo message
   *  Note: this example use `array` type as action argument payload, so that client can only pass position args
   *
   * @param _ - Meta data, this action don't care, so it give a `_` variable name
   * @param args - Need echo messages
   * @returns {string} - Combined message
   */
  actionEcho(_, ...args) {
    return args.join(' ')
  }

  /* sugar action */

  /**
   * Exec action in pipe
   *
   * @param _ - Meta data
   * @param actions - Action array
   * @returns {Promise.<[ActionResponse]>} Action responses
   */
  async actionPipeExec(_, ...actions) {
    const execs = []
    for (const [idx, action] of actions.entries()) {
      if (idx === 0){
        execs.push([{ response: { results: { ignore: true } } }])
      }
      execs.push(this.createPipeExecGenerator(this.ensureAction(action)))
    }
    execs.push(collect)
    return await itPipe(...execs)
  }

  /**
   * Yield each item of iterable variable
   * @param _ - unused
   * @param args - Iterators
   */
  async *actionMapArgs(_, ...args) {
    for (const iterable of args) {
      for await (const item of iterable) {
        yield item
      }
    }
  }

  /**
   * Reduce PipeExec or Parallel action results
   * @param _ - unused
   * @param pipeResults - ActionResponse array
   * @returns {Array} - Pure results array
   */
  actionReduceResults(_, pipeResults) {
    return pipeResults.map(item => item.response.results)
  }

  /**
   * Flat more args and exec action
   *  Note: If your only have one args need flat, you can set `meta.flatPreActionResults` to a normal action
   * @param exec - shell.exec
   * @param action - action
   * @param more - more args
   * @returns {Promise.<json>} action response
   */
  async actionXargs({exec}, action, ...more) {
    action = this.ensureAction(action)
    action.args = action.args.concat(more.flat())
    const response = await exec(action)
    return response.json()
  }

  /**
   * Parallel exec action
   * @param exec - shell.exec
   * @param action - action
   * @param callbackAction - callback action
   * @param batch - how many actions to parallel exec
   * @param more - more args
   * @returns {Promise.<*>} action response
   */
  async actionParallelExec({exec}, action, callbackAction, batch, ...more) {
    action = this.ensureAction(action)
    let waits = []
    let responses = []
    const flushWaits = async () => {
      responses = responses.concat(await Promise.all(waits))
      waits = []
    }

    if (callbackAction) {
      callbackAction = this.ensureAction(callbackAction)
    }

    const doCallbackAction = async (results) => {
      let command = cloneDeep(callbackAction)
      command.args = command.args.concat([action, results])
      await exec(command)
    }

    for (const args of more) {
      const command = cloneDeep(action)
      command.args = action.args.concat(args)
      let promise = exec(command)

      if (callbackAction) {
        promise.then(doCallbackAction).catch(doCallbackAction)
      }

      waits.push(promise)

      if (waits.length === batch) {
        await flushWaits()
      }
    }

    if (waits.length) {
      await flushWaits()
    }

    return responses.map(item => item.payloads).reduce((a, b) => a.concat(b), [])
  }

  /* action helper */

  /**
   * Action helper
   *  use helper can make pipe action more effective
   *
   *  example:
   *    actionPlus = (_, a, b) => a + b
   *    actionSum = (_, args) => args.reduce((a, b) => a + b, 0)
   *    await shell.exec(shell.Action.map([[1,2,3]]).plus([1]).Collect.Sum)
   *    equal => await shell.exec({
   *      action: '/PipeExec',
   *      args: [
   *        {
   *          action: '/PipeExec',
   *          args: [
   *            {action: '/MapArgs', args: [[1,2,3]]},
   *            {action: '/Plus', args: [1]}
   *          ]
   *        },
   *        {action: '/ReduceResults'},
   *        {action: '/Sum'},
   *      ]
   *    })
   * @param autoPipe - If auto use pipe action when actions more than one
   * @param pipeOption - pipe option
   * @param actions - Actions
   * @returns {Proxy} Proxy action helper so that it can dynamic get action from shell
   */
  action(autoPipe=true, pipeOption={}, actions=[]) {
    return new Proxy(new ActionHelper(this, autoPipe, pipeOption, actions), proxyHandler)
  }

  /**
   * Getter for action helper method
   *  Note: **All Action** in shell can be access by two ways
   *    1. getter with default arguments, the action name first letter is upper case
   *      example: shell.Action.Sum or shell.Action.Plus
   *    2. function, the action name first letter is lower case
   *      example: shell.Action.sum(option) or shell.action.plus(option)
   *  Note: helper contains some alias action(e.g. map/reduce/pipe) and some shortcut action(e.g. collect)
   */
  get Action() {
    return this.action()
  }
}

export default Shell