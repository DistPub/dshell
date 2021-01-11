import uuidv4 from 'https://cdn.jsdelivr.net/npm/uuid@8.3.2/dist/esm-browser/v4.js'
import uuidv5 from 'https://cdn.jsdelivr.net/npm/uuid@8.3.2/dist/esm-browser/v5.js'

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