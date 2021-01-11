export function log(text) {
  console.log(text)
}
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
export const AsyncFunction = (async () => {}).constructor
export const AsyncGeneratorFunction = (async function* () {}).constructor
export const GeneratorFunction = (function* () {}).constructor