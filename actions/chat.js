import {sleep} from '../utils.js'

function createStreamAction(channel, stream) {
  const start = () => channel.addStream(stream)
  const stop = () => stream.getTracks().map(track => track.stop())
  const hangUp = () => {
    channel.removeStream(stream)
    stop()
  }
  const toggle = (kind) => stream.getTracks()
    .filter(track => track.kind === kind).map(track => track.enabled = !track.enabled)
  return [start, toggle, hangUp, stop]
}

async function connect(exec, toWho, initiator=true) {
  if (initiator) {
    await exec({action: '/Ping', receivers: [toWho]})
  }
  const channel = this.userNode.getRTCChannel(toWho)
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  return [channel, stream]
}

async function VideoChat({exec}, toWho, waitTime=60){
  const [channel, localStream] = await connect.apply(this, [exec, toWho])
  const [start, toggle, hangUp, stop] = createStreamAction(channel, localStream)

  channel.on('stream', stream => {
    stream.onremovetrack = hangUp
    this.emit('VideoChat:stream', { who: toWho, localStream, stream, hangUp, toggle })
  })

  const response = await exec({action: '/OnVideoChat', receivers: [toWho], args: [this.userNode.id, waitTime]})
  const deal = response.json()

  if (!response.ok) {
    stop()
    throw `video call init failed, error: ${deal}`
  }

  if (deal) {
    start()
  } else {
    stop()
  }
  return deal
}

async function OnVideoChat({exec}, fromWho, waitTime){
  const [channel, localStream] = await connect.apply(this, [exec, fromWho, false])
  const [start, toggle, hangUp, stop] = createStreamAction(channel, localStream)

  channel.on('stream', stream => {
    stream.onremovetrack = hangUp
    this.emit('OnVideoChat:stream', { who: fromWho, stream, localStream, hangUp, toggle })
  })

  let agree = null

  const accept = async () => {
    if (!waitTime) {
      throw 'other side already stop init'
    }
    agree = true
    start()
  }

  const refuse = () => {
    agree = false
    stop()
  }

  this.emit('OnVideoChat:call', { who: fromWho, accept, refuse })

  while (waitTime) {
    await sleep(1000)
    waitTime --

    if (agree !== null) {
      break
    }
  }
  return agree
}
export default [VideoChat, OnVideoChat]