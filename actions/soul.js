async function PushFile({ soul }, path, data) {
  return await soul.push(data, path)
}

async function PullFile({ soul }, path) {
  return await soul.pull(path)
}

/**
 * Get ipfs path from mfs path
 * @return {string} ipfs path
 */
async function IpfsPath({ soul }, mfs) {
  return `/ipfs/${await soul.getMemory()}${mfs}`
}

export default [PushFile, PullFile, IpfsPath]