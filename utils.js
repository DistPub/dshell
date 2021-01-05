export function log(text) {
  console.log(text)
}
export const AsyncFunction = (async () => {}).constructor
export const AsyncGeneratorFunction = (async function* () {}).constructor
export const GeneratorFunction = (function* () {}).constructor