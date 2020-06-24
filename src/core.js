#!/usr/bin/env node

require('@babel/register');
const path = require('path');
const fs = require('fs');
const app = require('express')();
const bodyParser = require('body-parser');
const upload = require('multer')();
const axios = require('axios');
const querystring = require('querystring');
const pathToRegexp = require('path-to-regexp');
const ROOT_DIR = path.join(__dirname, '../../../');
let PORT;
let MOCK_DIR;
let LISTEN;
let HEADERS;
let USE_TEMP_MOCK;
let apiList = {};
let fallbackApiList = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(upload.array());

// 获取配置
function getConfig() {
  let config = {};
  const {configPath, port, mockPath, listen, useTempMock} = process.env;
  try {
    const res = require(path.join(ROOT_DIR, configPath || '/.mock-server.js'));
    config = res.default || res;
  } catch (e) {
    console.log(e);
  }
  PORT = port || config.port || 3000;
  MOCK_DIR = path.join(ROOT_DIR, mockPath || config.mockPath || '/mock');
  LISTEN = listen || config.listen;
  HEADERS = config.headers || {};
  USE_TEMP_MOCK = !!useTempMock || config.useTempMock;
}

// 初始化mock目录api
function collectApi() {
  apiList = {};
  fs.readdir(MOCK_DIR, function (err, files) {
    if (!err) {
      files.forEach(function (filename) {
        if (/^.*js$/.test(filename)) {
          const filePath = path.join(MOCK_DIR, filename);
          delete require.cache[filePath];
          const data = require(filePath);
          apiList = Object.assign(apiList, data);
        }
      });
    } else {
      console.log('初始化mock目录api失败', err);
    }
  });
}

// 初始化mock/_temp目录api
function collectFallbackApi() {
  fallbackApiList = {};
  fs.readdir(path.join(MOCK_DIR, '/_temp'), function (err, files) {
    if (!err) {
      files.forEach(function (filename) {
        if (/^.*js$/.test(filename)) {
          const filePath = path.join(MOCK_DIR, '/_temp', filename);
          delete require.cache[filePath];
          const data = require(filePath);
          fallbackApiList = Object.assign(fallbackApiList, data);
        }
      });
    } else {
      console.log('初始化mock/_temp目录api失败', err);
    }
  });
}


// 监听mock一级目录文件变化
function watchMockFiles() {
  fs.watch(MOCK_DIR, function (event, filename) {
    if (/^.*js$/.test(filename)) {
      console.log(filename, 'update success!');
      collectApi();
    }
  });
}

// Listen模式
function listenMode() {
  app.all('/*', async function (req, res) {
    const {method, headers, query, _parsedUrl, body} = req;
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', headers['origin']);
    res.header('Access-Control-Allow-Headers', headers['access-control-request-headers']);
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');

    if (method === 'OPTIONS') res.sendStatus(200);
    else {
      const url = _parsedUrl.pathname;
      let data = body;
      if (headers['content-type'] && headers['content-type'].indexOf('application/json') < 0) {
        data = body ? querystring.stringify(body) : undefined;
      }
      try {
        console.log('----------------------------------------------');
        console.log(`${method} ${url}`);
        console.log('query', query);
        console.log('body', data);

        const result = await axios({
          baseURL: LISTEN,
          url,
          method,
          headers: {...headers, ...HEADERS},
          params: query,
          data,
        });
        res.send(result.data);
        writeResponseData(method, url, result.data);
      } catch (e) {
        console.log(e);
        res.sendStatus(500);
      }
    }
  });
}

// Mock模式
function mockMode() {
  app.all('/*', async function (req, res) {
    const {method, headers, query, _parsedUrl, body} = req;
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', headers['origin']);
    res.header('Access-Control-Allow-Headers', headers['access-control-request-headers']);
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');

    if (method === 'OPTIONS') res.sendStatus(200);
    else {
      const url = _parsedUrl.pathname;

      console.log('----------------------------------------------');
      console.log(`${method} ${url}`);
      console.log('query', query);
      console.log('body', body);

      let responseBody = null;
      [apiList, fallbackApiList].forEach(list => {
        if (!responseBody) {
          for (let one in list) {
            if (list.hasOwnProperty(one)) {
              let split = one.split(' ');
              if (split.length === 2) {
                const reg = pathToRegexp(split[1]);
                if (reg.exec(url) && split[0].toUpperCase() === method.toUpperCase()) {
                  responseBody = list[one];
                }
              } else {
                const reg = pathToRegexp(split[0]);
                if (reg.exec(url)) {
                  responseBody = list[one];
                }
              }
            }
          }
        }
      });
      if (responseBody) {
        if (typeof responseBody === 'function') {
          try {
            const data = await responseBody(req, res);
            res.send(data);
          } catch (e) {
            res.sendStatus(500);
          }
        } else {
          res.send(responseBody);
        }
      } else {
        res.sendStatus(404);
      }
    }
  });
}

// 将请求数据写入临时文件
function writeResponseData(method, url, data) {
  const filePath = path.join(MOCK_DIR, `_temp/${url.replace(/\//g, '.')}${method === 'GET' ? '' : '-' + method}.js`);
  fs.writeFile(filePath, `module.exports = ${JSON.stringify({[`${method} ${url}`]: data})}`, (err) => {
    if (err) {
      console.log(err);
    }
  });
}

// 初始化服务
function init() {
  // 获取配置
  getConfig();

  // 写入_temp目录
  fs.mkdir(path.join(MOCK_DIR, '_temp'), {recursive: true}, (err) => {
  });

  if (LISTEN) {
    listenMode();
  } else {
    collectApi();
    USE_TEMP_MOCK && collectFallbackApi();
    watchMockFiles();
    mockMode();
  }

  app.listen(PORT, function () {
    console.log(`Mock server listening on port: ${PORT}, Mode: ${LISTEN ? '\033[34m ListenMode \033[0m' : '\033[34m MockMode \033[0m'}`);
  });
}

init();
