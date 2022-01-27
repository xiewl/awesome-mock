#!/usr/bin/env node

require('@babel/register');
const path = require('path');
const fs = require('fs');
const app = require('express')();
const pathToRegexp = require('path-to-regexp');
const _ = require('lodash');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const ROOT_DIR = path.join(__dirname, '../../../');
let PORT;
let MOCK_DIR;
let LISTEN;
let DEV_HOST;
let HEADERS;
let USE_TEMP_MOCK;
let apiList = {};
let fallbackApiList = {};

// 获取配置
function getConfig() {
  let config = {};
  const { configPath, port, mockPath, listen, useTempMock } = process.env;
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
  DEV_HOST = config.devHost;
}

// 初始化mock目录api
function collectApi() {
  apiList = {};
  fs.readdir(MOCK_DIR, function(err, files) {
    if (!err) {
      files.forEach(function(filename) {
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
  fs.readdir(path.join(MOCK_DIR, '/_temp'), function(err, files) {
    if (!err) {
      files.forEach(function(filename) {
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
  fs.watch(MOCK_DIR, function(event, filename) {
    if (/^.*js$/.test(filename)) {
      console.log(filename, 'update success!');
      collectApi();
    }
  });
}

// Listen模式
function listenMode() {
  app.use(
    '/*',
    createProxyMiddleware({
      target: LISTEN,
      changeOrigin: true,
      secure: false,
      selfHandleResponse: true,
      onProxyReq(proxReq, req, res) {
        proxReq.setHeader('origin', LISTEN);
      },
      onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        const origin = req.headers.origin || DEV_HOST;
        res.setHeader('Access-Control-Allow-Credentials', true);
        res.setHeader('Access-Control-Allow-Origin', origin);
        // 优先获取mock数据
        const mockData = await getMockData(req, res);
        if (!!mockData) {
          res.statusCode = 200;
          return JSON.stringify(mockData);
        }
        writeResponseData(req.method, req.path, responseBuffer.toString('utf-8'));
        return responseBuffer;
      }),
    }),
  );
}

// 获取MockData
async function getMockData(req, res) {
  const { method, headers, query, path, body } = req;
  let responseBody = null;
  [apiList, fallbackApiList].forEach(list => {
    if (!responseBody) {
      for (let one in list) {
        if (list.hasOwnProperty(one)) {
          let split = one.split(' ');
          if (split.length === 2) {
            const reg = pathToRegexp(split[1]);
            if (reg.exec(path) && split[0].toUpperCase() === method.toUpperCase()) {
              responseBody = list[one];
            }
          } else {
            const reg = pathToRegexp(split[0]);
            if (reg.exec(path)) {
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
        return data;
      } catch (e) {
        return { success: false, msg: 'mock data format failed' };
      }
    } else {
      return responseBody;
    }
  } else {
    return false;
  }
}

// 将请求数据写入临时文件
function writeResponseData(method, url, data) {
  if (!data || !url) return;
  const filePath = path.join(
    MOCK_DIR,
    `_temp/${url.replace(/\//g, '.')}${method === 'GET' ? '' : '-' + method}.js`,
  );
  fs.writeFile(
    filePath,
    `module.exports = ${JSON.stringify({ [`${method} ${url}`]: JSON.parse(data) })}`,
    err => {
      if (err) {
        console.log(err);
      }
    },
  );
}

// 初始化服务
function init() {
  // 获取配置
  getConfig();

  // 写入_temp目录
  fs.mkdir(path.join(MOCK_DIR, '_temp'), { recursive: true }, err => {});

  collectApi();
  USE_TEMP_MOCK && collectFallbackApi();
  watchMockFiles();
  listenMode();

  app.listen(PORT, function() {
    console.log(`Mock server listening on port: ${PORT}`);
  });
}

init();
