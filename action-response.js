class ActionResponse {
  constructor(action, autoTripPipe=true, autoTripParallel=true) {
    this.action = action
    this.autoTripPipe = autoTripPipe
    this.autoTripParallel = autoTripParallel
    this._payloads = []
  }

  get isPipeAction() {
    return this.action.action === '/PipeExec'
  }

  get isParallelAction() {
    return this.action.action === '/Parallel'
  }

  get payloads() {
    if (this.isPipeAction && this.autoTripPipe) {
      return this._payloads[0].response.results
    }
    if (this.isParallelAction && this.autoTripParallel) {
      return this._payloads[0].response.results
    }
    return this._payloads
  }

  add(payload) {
    this._payloads.push(payload)
  }

  get ok() {
    return this.payloads.map(item => item.response.status).reduce((a, b) => a + b, 0) === 0
  }

  text() {
    if (!this.payloads.length) {
      return undefined
    }

    return this.payloads.map(item => item.response.results).join('\n')
  }

  toString() {
    return this.text()
  }

  json() {
    if (!this.payloads.length) {
      return undefined
    }

    let [payload, ...more] = this.payloads
    if (!more.length) {
      return payload.response.results
    }
    return this.payloads.map(item => item.response.results)
  }

  toJSON() {
    return this.json()
  }
}

export default ActionResponse