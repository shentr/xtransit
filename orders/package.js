'use strict';

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exists = promisify(fs.exists);
const readFile = promisify(fs.readFile);

let logger;

async function readPackage(pkgfile) {
  try {
    if (!await exists(pkgfile)) {
      return {};
    }

    const data = {};
    data.name = pkgfile;
    data.pkg = (await readFile(pkgfile, 'utf8')).trim();

    // lock file
    const lockfile = path.join(path.dirname(pkgfile), 'package-lock.json');
    if (await exists(lockfile)) {
      data.lock = (await readFile(lockfile, 'utf8')).trim();
    }

    return data;
  } catch (err) {
    logger.error(`readPackage failed: ${err.stack}`);
    return {};
  }
}

function readPackages(packages) {
  const tasks = [];
  for (const pkgfile of packages) {
    tasks.push(readPackage(pkgfile));
  }
  return Promise.all(tasks);
}

exports = module.exports = async function() {
  const message = {
    type: 'package',
    data: { pkgs: [] },
  };

  const packages = this.packages;
  if (!packages.length) {
    return message;
  }
  const pkgs = await readPackages(packages);
  message.data = { pkgs };
  return message;
};

exports.init = async function() {
  logger = this.logger;
};

exports.interval = 60 * 60;
