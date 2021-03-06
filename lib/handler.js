'use strict';

const fs = require('fs');
const cp = require('child_process');
const { promisify } = require('util');
const exists = promisify(fs.exists);
const execFile = promisify(cp.execFile);
const path = require('path');
const utils = require('../common/utils');
const getNodeExe = require('../common/exe');

/* istanbul ignore next */
function checkFileExist(filePath) {
  let count = 0;
  const timer = setInterval(async () => {
    // max 2min
    if (count > 60 * 2) {
      clearInterval(timer);
      this.sendMessage('action', { filePath });
    }
    count++;

    // check file exists
    if (!await exists(filePath)) {
      return;
    }
    clearInterval(timer);
    this.sendMessage('action', { filePath });
  }, 1000);
}

/* istanbul ignore next */
function checkActionFile(cmd, options, stdout, stderr) {
  if (cmd === 'xprofctl' && !stderr) {
    const extraTime = 3 * 1000;
    try {
      options = JSON.parse(options);
      const { filepath: filePath } = JSON.parse(stdout.trim());
      if (utils.isNumber(options.profiling_time)) {
        setTimeout(() => checkFileExist.call(this, filePath), options.profiling_time + extraTime);
      } else {
        setTimeout(() => checkFileExist.call(this, filePath), extraTime);
      }
    } catch (err) {
      this.logger.error(`checkActionFile failed: ${err.message}`);
    }
  }
}

module.exports = async function(message) {
  try {
    this.logger.debug(`[from xtransit-server] >>>>>>>>>>>>>>>>>>> ${message}`);
    const data = JSON.parse(message);
    const { traceId, type } = data;

    // shutdown
    if (type === 'shutdown') {
      this.shutdown();
      return;
    }

    // exec command
    if (type === 'exec_command') {
      const { command, expiredTime, env } = data.data;

      // check command file
      const [cmd, ...args] = command.split(' ');
      const commandFile = path.join(__dirname, '../commands', `${cmd}.js`);
      if (!await exists(commandFile)) {
        return this.sendMessage('response', { ok: false, message: `file ${commandFile} not exists` }, traceId);
      }
      args.unshift(commandFile);

      // set exec options
      const execOptions = {
        timeout: expiredTime || 3000,
        env: Object.assign({
          XTRANSIT_AGENT_ID: utils.getAgentId(this.ipMode),
          XTRANSIT_LOGDIR: this.logdir,
          XTRANSIT_EXPIRED_TIME: expiredTime,
        }, process.env, env || {}),
      };

      // exec command
      const nodeExe = await getNodeExe(process.pid, false);
      this.logger.debug(`[execute command] ${nodeExe} ${args.join(' ')}`);
      const { stdout, stderr } = await execFile(nodeExe, args, execOptions);

      // check action file status
      checkActionFile.call(this, cmd, args.pop(), stdout, stderr, this.logger);

      return this.sendMessage('response', { ok: true, data: { stdout, stderr } }, traceId);
    }
  } catch (err) {
    this.logger.error(`handle message failed: ${err}, raw message: ${message}`);
  }
};
