# O-Doc 接口文档

本文档描述了O-Doc项目的API接口规范，包括接口列表、请求参数、响应格式等信息。

## 📋 文档说明

- 接口基础URL：`http://localhost:11800/api/v1`
- 请求方式：支持GET、POST、PUT、DELETE等HTTP方法
- 响应格式：统一返回JSON格式数据
- 认证方式：JWT Token认证（待实现）

## 🛠️ 接口分类

### 1. 用户管理接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 用户注册 | POST | /user/register | 用户注册新账号 | 待实现 |
| 用户登录 | POST | /user/login | 用户登录系统 | 待实现 |
| 获取用户信息 | GET | /user/info | 获取当前用户信息 | 待实现 |
| 更新用户信息 | PUT | /user/info | 更新用户信息 | 待实现 |

### 2. 文章管理接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 创建文章 | POST | /article | 创建新文章 | 待实现 |
| 获取文章列表 | GET | /article/list | 获取文章列表 | 待实现 |
| 获取文章详情 | GET | /article/:id | 获取文章详情 | 待实现 |
| 更新文章 | PUT | /article/:id | 更新文章内容 | 待实现 |
| 删除文章 | DELETE | /article/:id | 删除文章 | 待实现 |

### 3. 分类管理接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 创建分类 | POST | /category | 创建新分类 | 待实现 |
| 获取分类列表 | GET | /category/list | 获取分类列表 | 待实现 |
| 更新分类 | PUT | /category/:id | 更新分类信息 | 待实现 |
| 删除分类 | DELETE | /category/:id | 删除分类 | 待实现 |

### 4. 标签管理接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 创建标签 | POST | /tag | 创建新标签 | 待实现 |
| 获取标签列表 | GET | /tag/list | 获取标签列表 | 待实现 |
| 更新标签 | PUT | /tag/:id | 更新标签信息 | 待实现 |
| 删除标签 | DELETE | /tag/:id | 删除标签 | 待实现 |

### 5. 文集管理接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 创建文集 | POST | /api/anthology/create | 创建新文集 | 已实现 |
| 获取文集列表 | GET | /api/anthology/list | 获取文集列表 | 已实现 |
| 获取文集详情 | GET | /api/anthology/detail/:coll_id | 根据coll_id获取文集详情 | 已实现 |
| 更新文集 | PUT | /api/anthology/:id | 更新文集信息 | 待实现 |
| 删除文集 | DELETE | /api/anthology/:id | 删除文集 | 待实现 |

#### 5.1 创建文集接口
**请求路径**：`/api/anthology/create`
**请求方式**：POST
**请求参数**：
```json
{
  "title": "文集标题",
  "description": "文集描述",
  "icon_id": "book",
  "permission": "public"
}
```

**参数说明**：
| 参数名 | 类型 | 必填 | 描述 |
|-------|------|------|------|
| title | string | 是 | 文集标题，最长20个字符 |
| description | string | 否 | 文集描述，最长100个字符 |
| icon_id | string | 是 | 图标ID，用于前端显示图标 |
| permission | string | 是 | 访问权限，可选值：public（公开）、private（私密） |

**响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "coll_id": "coll_1234567890",
    "title": "文集标题",
    "description": "文集描述",
    "icon_id": "book",
    "permission": "public",
    "is_top": false,
    "count": 0,
    "sort": 0,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
}
```

#### 5.2 获取文集列表接口
**请求路径**：`/api/anthology/list`
**请求方式**：GET
**响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "coll_id": "coll_1234567890",
      "title": "小橘部署指南",
      "count": 42,
      "icon_id": "cpu",
      "isTop": true,
      "description": "全面介绍小橘文档私有化部署方案",
      "articles": [
        {
          "article_id": "art_001",
          "title": "服务器环境依赖检查清单",
          "date": "11-24"
        },
        {
          "article_id": "art_002",
          "title": "Docker Compose 一键部署",
          "date": "11-20"
        }
      ],
      "permission": "public"
    },
    {
      "id": 2,
      "coll_id": "coll_0987654321",
      "title": "API 接口开发手册",
      "count": 128,
      "icon_id": "zap",
      "isTop": true,
      "description": "后端接口定义、鉴权机制及错误码字典查询",
      "articles": [
        {
          "article_id": "art_003",
          "title": "认证鉴权：Access Token 获取",
          "date": "12-01"
        }
      ],
      "permission": "public"
    }
  ]
}
```

**字段说明**：
| 字段名 | 类型 | 描述 |
|-------|------|------|
| id | number | 文集数据库ID |
| coll_id | string | 文集唯一标识 |
| title | string | 文集标题 |
| count | number | 文章数量 |
| icon_id | string | 图标ID |
| isTop | boolean | 是否置顶 |
| description | string | 文集描述 |
| articles | array | 文章摘要列表，最多返回前3篇文章 |
| permission | string | 访问权限 |

**articles数组字段说明**：
| 字段名 | 类型 | 描述 |
|-------|------|------|
| article_id | string | 文章唯一标识 |
| title | string | 文章标题 |
| date | string | 更新日期，格式：MM-DD |

#### 5.3 获取文集详情接口
**请求路径**：`/api/anthology/detail/:coll_id`
**请求方式**：GET
**响应示例**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "coll_id": "coll_1234567890",
    "title": "小橘部署指南",
    "description": "全面介绍小橘文档私有化部署方案",
    "icon_id": "cpu",
    "userid": "admin",
    "permission": "public",
    "is_top": true,
    "count": 42,
    "sort": 0,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  }
}
```

### 6. 资源管理接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 上传文件 | POST | /asset/upload | 上传文件资源 | 待实现 |
| 获取资源列表 | GET | /asset/list | 获取资源列表 | 待实现 |
| 删除资源 | DELETE | /asset/:id | 删除资源 | 待实现 |

### 7. 统计接口

| 接口名称 | 请求方式 | 接口路径 | 功能描述 | 状态 |
|---------|---------|---------|---------|------|
| 获取系统统计 | GET | /stats/system | 获取系统统计数据 | 待实现 |
| 获取文章统计 | GET | /stats/article | 获取文章统计数据 | 待实现 |

## 📊 响应格式

### 成功响应格式
```json
{
  "code": 200,
  "message": "success",
  "data": {
    // 具体接口返回数据
  }
}
```

### 错误响应格式
```json
{
  "code": 错误码,
  "message": "错误信息",
  "data": null
}
```

## 📝 错误码说明

| 错误码 | 错误信息 | 说明 |
|-------|---------|------|
| 200 | success | 请求成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未授权访问 |
| 403 | Forbidden | 禁止访问 |
| 404 | Not Found | 请求资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |
| 501 | Not Implemented | 接口未实现 |

## 🚀 认证方式

### JWT Token认证（待实现）

1. 用户登录成功后获取Token
2. 在请求头中添加Authorization字段：`Authorization: Bearer {token}`
3. Token有效期：7天

## 📌 开发计划

- [ ] 实现用户认证系统
- [ ] 开发文章管理接口
- [ ] 开发分类和标签管理接口
- [ ] 实现文集管理功能
- [ ] 开发资源上传功能
- [ ] 添加统计接口

## 📅 更新日志

- 2025-01-15：详细更新文集管理接口文档，包括创建文集、获取文集列表和获取文集详情接口的完整信息，修正接口路径为实际部署路径
- 2025-XX-XX：初始化接口文档结构
