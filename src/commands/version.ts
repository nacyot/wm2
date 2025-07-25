import { Command } from '@oclif/core'

import { VERSION } from '../version.js'

export default class Version extends Command {
  static override description = 'Show version'
static override examples = ['<%= config.bin %> <%= command.id %>']
static override summary = 'Show version'

  async run(): Promise<void> {
    this.log(VERSION)
  }
}