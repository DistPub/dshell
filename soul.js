import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.9.6/esm/index.js/+esm'
import { log } from './utils.js'
import { IPFS, datastoreLevel, events, cids, uint8ArrayConcat, Mutex } from "./dep.js"

class Soul extends events.EventEmitter {
  constructor(db, username) {
    super()
    this.username = username
    this.db = db
    this.experiences = []
    this.pre = null
    this.lock = new Mutex()
  }

  async init(optionFilter=item=>item) {
    const repo = `${this.username}/ipfs`
    this.node = await IPFS.create(optionFilter({ repo }))
    this.repo = new datastoreLevel(repo, {prefix: '', version: 2})
    try {
      this.experiences = (await this.db.get('experiences')).map(item => new cids(item))
      this.pre = new cids(await this.db.get('pre'))
    } catch(error) {
      log(`get experiences from db error: ${error}`)
    }
  }

  addEventListener(shell) {
    shell.on('action:request', data => this.handleExperience(data))
    shell.on('action:response', data => this.handleExperience(data))
  }

  async operateExperiences(experiences) {
    const release = await this.lock.acquire()
    try {
      const experiences = [...this.experiences]

      if (experiences) {
        if (experiences instanceof Array) {
          this.experiences = this.experiences.concat(experiences)
        } else {
          this.experiences.push(experiences)
        }
      } else {
        this.experiences = []
      }
      await this.db.put('experiences', this.experiences.map(item => item.toString()))
      return experiences
    } finally {
      release()
    }
  }

  async operatePre(pre) {
    const release = await this.lock.acquire()
    try {
      this.pre = pre
      await this.db.put('pre', this.pre.toString())
    } finally {
      release()
    }
  }

  async handleExperience(data) {
    let cid

    try {
      cid = await this.node.dag.put(data)
    } catch (error) {
      // response contains not supported data, try reset put again
      if (error.message.includes('Unknown type')) {
        data['response'] = null
        cid = await this.node.dag.put(data)
      } else {
        throw error
      }
    }
    await this.operateExperiences(cid)
  }

  async summarize() {
    if (!this.experiences.length) {
      return
    }
    const experiences = await this.operateExperiences(null, true)
    const cid = await this.node.dag.put({ experiences: experiences, pre: this.pre })
    await this.operatePre(cid)
  }

  async remember() {
    const path = dayjs().format('/YYYY/MM/DD')
    await this.node.files.mkdir(path, { parents: true })
    const file = `${path}/history.txt`
    await this.node.files.touch(file)


    await this.summarize()

    if (!this.pre) {
      return
    }

    const { size: offset } = await this.node.files.stat(file)
    await this.node.files.write(file, `${this.pre}\n`, { offset })
  }

  async backwards(experience=null, reverse=true) {
    let experiences;
    let pre;

    if (!experience) {
      experiences = this.experiences
      pre = this.pre
    } else {
      const { value } = await this.node.dag.get(experience)
      experiences = value.experiences
      pre = value.pre
    }

    if (reverse) {
      experiences = experiences.reverse()
    }

    experiences.map(async item => this.emit('backwards', (await this.node.dag.get(item)).value))
    return pre
  }

  async empathy(experience, deep=0) {
    let cursor = experience
    let experiences = []
    let recursive = deep === 1

    do {
      const { value } = await this.node.dag.get(cursor)
      experiences = value.experiences.concat(experiences)
      cursor = value.pre

      if (!cursor) {
        break
      }

      deep ++
    } while (deep <= 0 || recursive)
    experiences.map(async item => this.emit('empathy', (await this.node.dag.get(item)).value))
    await this.operateExperiences(experiences)
  }

  async resetMemory(root) {
    await this.repo.put('/local/filesroot', new cids(root).bytes)
  }

  async getMemory() {
    return new cids(await this.repo.get('/local/filesroot')).toString()
  }

  /**
   * Push file to ipfs
   * @param content - data
   * @param path - tmp path or mfs path
   * @returns {Promise.<string>} ipfs path or mfs path
   */
  async push(content, path) {
    const tmp = path.startsWith('/tmp/') || path.startsWith('/ipfs/')
    const filename = path.substring(path.lastIndexOf("/") + 1, path.length);

    const fileObject = { path: filename, content }
    let options

    if (tmp) {
      options = {wrapWithDirectory: true}
    }

    let { cid } = await this.node.add(fileObject, options)

    if (tmp) {
      return `/ipfs/${cid}/${filename}`
    }

    const copy = async () => await this.node.files.cp(`/ipfs/${cid}`, path, {parents: true})
    const remove = async () => await this.node.files.rm(path)

    try {
      await copy()
    } catch (error) {
      log(`push error: ${error}`)

      if (error.code === 'ERR_ALREADY_EXISTS') {
        await remove()
        await copy()
      }
    }
    return path
  }

  /**
   * Pull file from ipfs
   * @param path - ipfs path or mfs path
   * @returns {Promise.<uint8Array>}
   */
  async pull(path) {
    let cid

    if (!path.startsWith('/ipfs/')) {
      const stats = await this.node.files.stat(path)
      cid = stats.cid
    }

    const data = []
    let size = 0
    for await (const chunk of this.node.cat(cid || path)) {
      data.push(chunk)
      size = size + chunk.size
    }

    return uint8ArrayConcat(data, size)
  }
}

export default Soul