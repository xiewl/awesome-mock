# @kc/mock项目说明

### 目录结构
```
src                             # 项目源码目录
  |--index.js                   # 插件入口文件 
  |--core.js                    # 插件主逻辑文件
  |--tool.js                    # 插件工具文件
```

### 关于@kc/mock
- 提供Listen和Mock两种使用模式，通过配置文件切换。
- 接入[Mock.js](http://mockjs.com/examples.html)，支持动态生成Mock数据
- Mock返回值除基本格式外，还支持自定义函数。可用于设置响应头数据
- 提供工具方法，封装了一些模拟请求时可能要用到的场景

### 配置文件说明
- 服务会自动读取项目根目录下的`.mock-server.js`配置文件，也可通过cli参数`configPath`指定目录
- 参数说明
```
export default {
  port: 3000,   // mock服务端口，默认：3000
  mockPath: '/mock', // mock目录，服务会自动遍历一级目录下所有的非'_'开头的js文件内的数据。默认：'/mock'
  listen: '', // ListenMode下需要转发的服务器地址，当有值时会自动切换到ListenMode，默认：null
  headers: {   // ListenMode下自定义请求头，如cookie，默认：{}
    'cookie': 'SESSION=OGNmMDVjMjUtNDIwZC00MzIwLWFjOTMtYzkyOWIyYzc2MjU5'
  } 
}
```
### ListenMode与MockMode
- 当配置文件配有`listen`字段时，服务会自动切换到`ListenMode`，
此模式主要作用是用于快速收集接口真实数据，浏览器在发起接口请求时会自动转发请求到真实服务器，
并将返回的数据保存到`mockPath`目录下的`_temp`目录，此数据可供`MockMode`使用。
- `MockMode`下，服务会自动遍历收集一级目录下所有的非'_'开头的js文件内的接口数据，当浏览器发起请求时，
匹配对应数据进行返回。返回值支持通过Mockjs动态生成，支持自定义函数。

### 如何使用
- `yarn add @kc/mock`
- 项目内创建`.mock-server.js`配置文件
- 创建mock目录与mock文件
```
const { Mock, Tool } = require('@kc/mock');

module.exports = {
  'GET /timestamp': {
    success: true,
    code: '200',
    msg: 'success',
    retry: false,
    data: 1579413764667,
  },
  '/kudev-core/project/page-list': async (req, res) => {
    await Tool.sleep(1500);
    res.send(
      Mock.mock({
        success: true,
        totalPage: 3,
        [`items|${req.query.pageSize}`]: [
          {
            id: '@id',
            name: '@ctitle',
            owner: '@cname',
            'projectType|1': req.query.projectType
              ? [+req.query.projectType]
              : [0, 1, 2, 3, 4, 5, 6, 7],
            'publishType|1': ['ORDERED', 'INDEPENDENT'],
            'status|1': req.query.status ? [+req.query.status] : [1, 2, 9],
            updatedAt: 1584687712479,
            createdAt: 1584686712479,
            detail: '@sentence',
          },
        ],
      }),
    );
  },
};
```
- `.mock-server.js`配置`mockPath`目录位置
- 执行命令`mock-server`，项目内baseUrl指向mock服务器
