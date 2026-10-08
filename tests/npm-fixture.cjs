const fs = require('node:fs');
const path = require('node:path');

// No personal npmrc, cache, CODEX_HOME, or environment-provided npm credentials.
function npmEnvironment(f, registry) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key) && !/^(?:NPM_TOKEN|NODE_AUTH_TOKEN|CODEX_HOME|NODE_OPTIONS)$/i.test(key)));
  fs.mkdirSync(f.home, { recursive: true });
  const config = path.join(f.base, 'npm config'); fs.mkdirSync(config);
  for (const name of ['user.npmrc', 'global.npmrc']) fs.writeFileSync(path.join(config, name), '');
  return { ...env, HOME: f.home, USERPROFILE: f.home, CODEX_HOME: path.join(f.home, '.codex'),
    PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
    npm_config_userconfig: path.join(config, 'user.npmrc'), npm_config_globalconfig: path.join(config, 'global.npmrc'),
    npm_config_cache: path.join(f.base, 'npm cache'), npm_config_registry: registry || 'http://127.0.0.1:9',
    npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
    npm_config_fetch_retries: '0', npm_config_fetch_timeout: '5000', npm_config_proxy: '', npm_config_https_proxy: '',
  };
}
module.exports = { npmEnvironment };
