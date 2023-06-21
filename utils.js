import {uuidv4,uuidv5} from './dep.js'

export function uint8ArrayConcat(t,e){e||(e=t.reduce((t,e)=>t+e.length,0));const n=new Uint8Array(e);let c=0;for(const e of t)n.set(e,c),c+=e.length;return n}
export function log(text) {
  console.log(text)
}
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
export function generateUUID(UUIDNameSpace) {
  const uuid = uuidv4()
  if (UUIDNameSpace) {
    return uuidv5(uuid, UUIDNameSpace)
  }
  return uuid
}
export const AsyncFunction = (async () => {}).constructor
export const AsyncGeneratorFunction = (async function* () {}).constructor
export const GeneratorFunction = (function* () {}).constructor