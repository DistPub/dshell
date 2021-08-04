export class ActionHelper {
  constructor(shell, autoPipe=true, pipeOption={}, actions=[], namespace=null) {
    this.shell = shell
    this.autoPipe = autoPipe
    this.pipeOption = pipeOption
    this.actions = actions
    this.namespace = namespace
  }

  using(namespace) {
    this.namespace = namespace
    return this.clone()
  }

  clone() {
    return new Proxy(
      new ActionHelper(this.shell, this.autoPipe, this.pipeOption, this.actions, this.namespace),
      proxyHandler)
  }

  toJSON() {
    if (!this.actions.length) {
      throw `You need set one action at least!`
    }

    const [action, ...more] = this.actions

    if (!more.length) {
      return action
    }

    if (this.autoPipe) {
      return { ...this.pipeOption, action: '/PipeExec', args: this.actions }
    }

    throw 'You need use `pipe` action to aggregate multiple actions!'
  }

  static ensureOptions(options) {
    if (options instanceof Array) {
      return {args: options}
    }
    return options
  }

  /**
   * Shortcut for pipe then reduce
   *  Note: there is no action named `collect`
   * @param options - pipe action options
   * @returns {*} this helper
   */
  collect(options={}) {
    options = ActionHelper.ensureOptions(options)
    this.actions = [
      {...options, action: '/PipeExec', args: this.actions},
      {action: '/ReduceResults'}
    ]
    return this.clone()
  }

  /**
   * Shortcut for parallel then reduce
   *  Note: there is no action named `pCollect`
   * @param batch - how many actions to parallel
   * @param callback - callback action
   * @param meta - action meta info
   * @param options - parallel action options
   * @returns {*} this helper
   */
  pCollect({batch=10, callback=null, meta={}, ...options}={}) {
    if (!('flatPreActionResults' in meta)) {
      meta.flatPreActionResults = true
    }
    const action = this.actions.pop()
    this.actions.push({...options, meta, action: '/ParallelExec', args: [action, callback, batch]})
    this.actions.push({action: '/ReduceResults'})
    return this.clone()
  }

  get Collect() {
    return this.collect()
  }

  get PCollect() {
    return this.pCollect()
  }

  /**
   * Alias for action /ReduceResults
   */
  reduce(options={}) {
    options = ActionHelper.ensureOptions(options)
    this.actions.push({...options, action: '/ReduceResults'})
    return this.clone()
  }

  get Reduce() {
    return this.reduce()
  }

  /**
   * Alias for action /MapArgs
   */
  map(options={}) {
    options = ActionHelper.ensureOptions(options)
    this.actions.push({...options, action: '/MapArgs'})
    return this.clone()
  }

  get Map() {
    return this.map()
  }

  /**
   * Alias for action /PipeExec
   */
  pipe(options={}) {
    options = ActionHelper.ensureOptions(options)
    this.actions = [{...options, action: '/PipeExec', args: this.actions}]
    return this.clone()
  }

  get Pipe() {
    return this.pipe()
  }

  /**
   * Alias for action /ParallelExec
   */
  parallel({batch=10, meta={}, ...options}={}) {
    if (!('flatPreActionResults' in meta)) {
      meta.flatPreActionResults = true
    }
    const pAction = this.actions.pop()
    this.actions.push({...options, meta, action: '/ParallelExec', args: [pAction, batch]})
    return this.clone()
  }

  get Parallel() {
    return this.parallel()
  }
}

function constructActionProp(prop, namespace) {
  if (namespace) {
    return `action$${namespace}${prop}`
  }
  return `action${prop}`
}

function constructAction(prop, namespace) {
  if (namespace) {
    return `:${namespace}/${prop}`
  }
  return `/${prop}`
}

export const proxyHandler = {
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(...arguments)
    }

    let actionName;

    // naive call
    actionName = constructActionProp(prop, target.namespace)

    if (prop[0] === prop[0].toUpperCase()) {
      if (actionName in target.shell) {
        target.actions.push({action: constructAction(prop, target.namespace)})
        return target.clone()
      }
    }

    // normal call
    prop = prop[0].toUpperCase() + prop.slice(1)
    actionName = constructActionProp(prop, target.namespace)

    if (actionName in target.shell) {
      return (options={}) => {
        options = ActionHelper.ensureOptions(options)
        target.actions.push({...options, action: constructAction(prop, target.namespace)})
        return target.clone()
      }
    }

    throw `Action method(${actionName}) not found in shell`
  }
}
