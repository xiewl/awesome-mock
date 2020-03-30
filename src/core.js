#!/usr/bin/env node

require('@babel/register');
const path = require('path');
const fs = require('fs');
const app = require('express')();
const bodyParser = require('body-parser');
const upload = require('multer')();
const axios = require('axios');
const querystring = require('querystring');
const ROOT_DIR = path.join(__dirname, '../../../');
let PORT;
let MOCK_DIR;
let LISTEN;
let HEADERS;
let apiList = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(upload.array());

// 获取配置
function getConfig() {
  let config = {};
  const { configPath, port, mockPath, listen } = process.env;
  try {
    config = require(path.join(ROOT_DIR, configPath || '/.mock-server.js')).default;
  } catch (e) {
    console.log(e);
  }
  PORT = port || config.port || 3000;
  MOCK_DIR = path.join(ROOT_DIR, mockPath || config.mockPath || '/mock');
  LISTEN = listen || config.listen;
  HEADERS = config.headers || {};
}

// 初始化mock目录api（所有不以_开头的js文件）
function collectApi() {
  apiList = {};
  fs.readdir(MOCK_DIR, function(err, files) {
    if (!err) {
      files.forEach(function(filename) {
        if (/^[^_].*js$/.test(filename)) {
          const filePath = path.join(MOCK_DIR, filename);
          delete require.cache[filePath];
          const data = require(filePath);
          apiList = Object.assign(apiList, data);
        }
      });
    }
  });
}

// 监听mock目录文件变化
function watchMockFiles() {
  fs.watch(MOCK_DIR, function(event, filename) {
    if (/^[^_].*js$/.test(filename)) {
      console.log(filename, 'update success!');
      collectApi();
    }
  });
}

// Listen模式
function listenMode() {
  app.all('/*', async function(req, res) {
    console.log(req.headers);
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    if (req.headers['access-control-request-headers']) {
      res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      const { method, headers } = req;
      const url = req._parsedUrl.pathname;
      try {
        const result = await axios({
          baseURL: LISTEN,
          url,
          method,
          headers: {
            ...headers,
            ...HEADERS,
          },
          params: req.query,
          data: req.body ? querystring.stringify(req.body) : undefined,
        });
        res.send(result.data);
        writeResponseData(method, url, result.data);
      } catch (e) {
        res.sendStatus(500);
      }
    }
  });
}

// Mock模式
function mockMode() {
  app.all('/*', async function(req, res) {
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      const { method } = req;
      const pathname = req._parsedUrl.pathname;
      const responseBody = apiList[`${method} ${pathname}`] || apiList[pathname];
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
  const filePath = path.join(MOCK_DIR, `_tmep/${url.replace(/\//g, '.')}${method === 'GET' ? '' : '-' + method}.js`);
  fs.writeFile(filePath, `module.exports = ${JSON.stringify({ [`${method} ${url}`]: data })}`, (err) => {
    if (err) {
      console.log(err);
    }
  });
}

// 初始化服务
function init() {
  getConfig();
  collectApi();
  watchMockFiles();

  if (LISTEN) {
    listenMode();
    fs.mkdir(path.join(MOCK_DIR, '_tmep'), { recursive: true }, (err) => {
    });
  } else mockMode();

  app.listen(PORT, function() {
    console.log(`Mock server listening on port: ${PORT}, Mode: ${LISTEN ? '\033[34m ListenMode \033[0m' : '\033[34m MockMode \033[0m'}`);
  });
}

init();
