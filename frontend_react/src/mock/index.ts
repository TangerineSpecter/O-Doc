import { MockMethod } from 'vite-plugin-mock';
import Mock from 'mockjs';
import { articleDemoData } from './articleDemoData';
import homepageDemoData from './homepageDemoData.json';

// 辅助函数：从URL中提取参数
function getUrlParams(url: unknown, paramName: string): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  const match = url.match(new RegExp(`/${paramName}/([^/]+)`));
  return match ? match[1] : null;
}

// 生成随机文章数据
const generateArticle = (articleId: string) => {
  return {
    id: Mock.Random.integer(1, 1000),
    articleId,
    title: Mock.Random.ctitle(5, 20),
    content: Mock.Random.cparagraph(5, 10),
    collId: Mock.Random.string('lower', 8),
    author: Mock.Random.cname(),
    createdAt: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
    updatedAt: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
    isValid: true,
    permission: 'public' as const,
    readCount: Mock.Random.integer(100, 1000),
    categoryId: Mock.Random.string('lower', 8),
    sort: Mock.Random.integer(0, 100),
    desc: Mock.Random.csentence(10, 20),
    date: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
    readTime: Mock.Random.integer(1, 30),
    collection: Mock.Random.boolean(),
    tagList: [Mock.Random.cword(2, 4), Mock.Random.cword(2, 4)],
    category: '技术笔记'
  };
};

// 生成模拟资源数据
const generateMockResources = (count: number) => {
    const types = ['doc', 'image', 'video', 'audio', 'code', 'archive', 'design'];
    const names = [
        '需求说明书', 'UI设计稿', '演示视频', '接口文档', '数据库备份',
        'Logo源文件', '会议记录', '宣传物料', '测试报告', '架构图'
    ];
    // 模拟一些文章来源
    const articles = [
        '小橘文档部署指南 v2.0', 'React 组件库设计规范', '后端 API 接口鉴权说明',
        '2025 年度产品规划', 'Q4 运营活动复盘', null, null, null // null 表示未关联
    ];

    return Array.from({ length: count }).map((_, i) => {
        const type = types[i % types.length];
        const nameIdx = i % names.length;
        const ext = type === 'doc' ? 'pdf' : type === 'image' ? 'png' : type === 'code' ? 'js' : 'file';
        const sourceTitle = articles[i % articles.length];

        return {
            id: `res-${i}`,
            name: `${names[nameIdx]}_v${(i % 5) + 1}.${ext}`,
            type: type,
            size: `${(Math.random() * 10 + 0.5).toFixed(1)} MB`,
            date: `11-${(Math.floor(Math.random() * 30) + 1).toString().padStart(2, '0')}`,
            linked: !!sourceTitle,
            sourceArticle: sourceTitle ? { id: `art-${i}`, title: sourceTitle } : null
        };
    });
};

// 生成资源数据池
const ALL_MOCK_RESOURCES = generateMockResources(200);

// 分类和标签的模拟数据
const INITIAL_CATEGORIES = [
    { id: 'all', name: '全部分类', count: 383, description: '浏览知识库所有文档', iconKey: 'Layers', themeId: 'slate', isSystem: true },
    { id: 'uncategorized', name: '未分类', count: 12, description: '暂未关联任何分类的文档', iconKey: 'Box', themeId: 'slate', isSystem: true },
    { id: 'tech', name: '技术研发', count: 128, description: '后端架构、前端开发及代码规范', iconKey: 'Server', themeId: 'blue' },
    { id: 'product', name: '产品设计', count: 64, description: 'PRD文档、UI设计稿及交互规范', iconKey: 'PenTool', themeId: 'pink' },
    { id: 'ops', name: '运维部署', count: 42, description: '服务器配置、Docker及CI/CD', iconKey: 'Database', themeId: 'emerald' },
    { id: 'marketing', name: '市场运营', count: 35, description: '活动策划、SEO及数据分析', iconKey: 'Globe', themeId: 'orange' },
];

const INITIAL_TAGS = [
    { id: 'react', name: 'React', count: 45, themeId: 'blue' },
    { id: 'vue', name: 'Vue.js', count: 32, themeId: 'emerald' },
    { id: 'tailwind', name: 'Tailwind CSS', count: 28, themeId: 'cyan' },
    { id: 'docker', name: 'Docker', count: 15, themeId: 'sky' },
    { id: 'deploy', name: '自动化部署', count: 12, themeId: 'orange' },
    { id: 'backend', name: '后端架构', count: 38, themeId: 'violet' },
    { id: 'db', name: 'Database', count: 24, themeId: 'slate' },
    { id: 'api', name: 'RESTful API', count: 19, themeId: 'pink' },
    { id: 'perf', name: '性能优化', count: 9, themeId: 'amber' },
    { id: 'linux', name: 'Linux', count: 42, themeId: 'slate' },
];

const TAG_POOL = ['基础', '进阶', '最佳实践', 'React', 'Vue', 'Docker', 'API', '设计规范', '运维', '数据库'];

const generateArticlesForCategory = (catId: string, categories: any[]) => {
    const category = categories.find(c => c.id === catId);
    const catName = category ? category.name : '未知';

    return Array.from({ length: Math.floor(Math.random() * 6) + 4 }).map((_, i) => {
        const tagCount = Math.floor(Math.random() * 3) + 1;
        const shuffled = [...TAG_POOL].sort(() => 0.5 - Math.random());
        const tags = shuffled.slice(0, tagCount);

        return {
            id: `art-${catId}-${i}`,
            title: `${catName} - 相关文档 ${i + 1}`,
            desc: '本文档详细记录了该模块的核心业务逻辑与操作流程，旨在帮助团队成员快速理解并上手相关工作。',
            date: '2025-11-21',
            readTime: Math.floor(Math.random() * 20) + 5,
            tags: tags,
            collId: 'col_deploy_001'
        };
    });
};

const generateArticlesForTag = (tagId: string, tags: any[]): any[] => {
    const collections = ['小橘部署指南', 'API 开发手册', '微服务架构设计', '前端组件库', '最佳实践'];
    const tagName = tags.find(t => t.id === tagId)?.name || '技术';

    return Array.from({ length: Math.floor(Math.random() * 8) + 4 }).map((_, i) => ({
        id: `art-${tagId}-${i}`,
        title: `${tagId === 'all' ? '技术' : tagName} 相关技术深度解析 - 第 ${i + 1} 部分`,
        desc: '本文深入探讨了核心概念与最佳实践，适合中高级开发者阅读。包含了大量的代码示例与架构图解。',
        date: '2025-11-20',
        readTime: Math.floor(Math.random() * 15) + 3,
        collection: collections[Math.floor(Math.random() * collections.length)],
        collId: 'col_deploy_001'
    }));
};

// Mock配置
export default [
  // 获取文章详情
  {
    url: '/api/article/detail/:articleId',
    method: 'get',
    response: (req: any) => {
      const articleId = getUrlParams(req.url, 'articleId');
      return {
        code: 200,
        msg: 'success',
        data: {
          id: 1,
          articleId: articleId || '1',
          title: articleDemoData.title,
          content: articleDemoData.content,
          collId: 'col_deploy_001',
          author: '张三',
          createdAt: '2023-11-14 14:30:00',
          updatedAt: '2023-11-14 14:30:00',
          isValid: true,
          permission: 'public',
          readCount: 123,
          categoryId: 'cat_001',
          sort: 1
        }
      };
    }
  },

  // 创建文章
  {
    url: '/api/article/create',
    method: 'post',
    response: (req: any) => {
      return {
        code: 200,
        msg: 'success',
        data: {
          id: Mock.Random.integer(1, 1000),
          articleId: Mock.Random.string('lower', 10),
          title: req.body?.title,
          content: req.body?.content,
          collId: req.body?.collId,
          author: '张三',
          createdAt: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
          updatedAt: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
          isValid: true,
          permission: req.body?.permission || 'public',
          readCount: 0,
          categoryId: req.body?.categoryId,
          sort: req.body?.sort || 0
        }
      };
    }
  },

  // 更新文章
  {
    url: '/api/article/update/:articleId',
    method: 'put',
    response: (req: any) => {
      const articleId = getUrlParams(req.url, 'articleId');
      return {
        code: 200,
        msg: 'success',
        data: {
          id: Mock.Random.integer(1, 1000),
          articleId: articleId || '1',
          title: req.body?.title || Mock.Random.ctitle(5, 20),
          content: req.body?.content || Mock.Random.cparagraph(10, 50),
          collId: Mock.Random.string('lower', 8),
          author: '张三',
          createdAt: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
          updatedAt: Mock.Random.datetime('yyyy-MM-dd HH:mm:ss'),
          isValid: req.body?.isValid !== undefined ? req.body?.isValid : true,
          permission: req.body?.permission || 'public',
          readCount: Mock.Random.integer(0, 1000),
          categoryId: req.body?.categoryId,
          sort: req.body?.sort || 0
        }
      };
    }
  },

  // 删除文章
  {
    url: '/api/article/delete/:articleId',
    method: 'delete',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: null
      };
    }
  },

  // 文章列表接口，支持多条件查询
  {
    url: '/article/list',
    method: 'get',
    response: (req: any) => {
      // 获取查询参数
      const query = req.query;
      const collId = query.collId;
      const tagId = query.tagId;
      const categoryId = query.categoryId;
      const keyword = query.keyword;
      
      // 生成文章列表
      let articles = [];
      for (let i = 0; i < 10; i++) {
        articles.push(generateArticle(`art_${i}`));
      }
      
      // 根据查询参数过滤
      if (collId) {
        articles = articles.filter(article => article.collId === collId);
      }
      
      if (keyword) {
        articles = articles.filter(article => 
          article.title.toLowerCase().includes(keyword.toLowerCase())
        );
      }
      
      // 这里可以添加更多过滤逻辑（tagId, categoryId）
      
      return {
        code: 200,
        msg: 'success',
        data: articles
      };
    }
  },

  // 获取文集列表
  {
    url: '/api/anthology/list',
    method: 'get',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: homepageDemoData
      };
    }
  },

  // 创建文集
  {
    url: '/api/anthology/create',
    method: 'post',
    response: (req: any) => {
      return {
        code: 200,
        msg: 'success',
        data: {
          id: Mock.Random.integer(1, 1000),
          collId: `col_${Mock.Random.string('lower', 6)}`,
          title: req.body?.title,
          count: 0,
          iconId: req.body?.iconId || 'book',
          isTop: false,
          permission: req.body?.permission || 'public',
          description: req.body?.description,
          articles: [],
          sort: req.body?.sort || 0
        }
      };
    }
  },

  // 文集排序
  {
    url: '/api/anthology/:collId/sort',
    method: 'put',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: null
      };
    }
  },

  // 获取分类列表
  {
    url: '/api/category/list',
    method: 'get',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: INITIAL_CATEGORIES
      };
    }
  },

  // 创建分类
  {
    url: '/api/category/create',
    method: 'post',
    response: (req: any) => {
      const newCategory = {
        id: `cat-${Date.now()}`,
        count: 0,
        isSystem: false,
        ...req.body
      };
      return {
        code: 200,
        msg: 'success',
        data: newCategory
      };
    }
  },

  // 更新分类
  {
    url: '/api/category/update/:categoryId',
    method: 'put',
    response: (req: any) => {
      const categoryId = getUrlParams(req.url, 'categoryId');
      const updatedCategory = {
        id: categoryId,
        ...req.body
      };
      return {
        code: 200,
        msg: 'success',
        data: updatedCategory
      };
    }
  },

  // 删除分类
  {
    url: '/api/category/delete/:categoryId',
    method: 'delete',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: null
      };
    }
  },

  // 根据分类ID获取文章
  {
    url: '/api/category/articles/:categoryId',
    method: 'get',
    response: (req: any) => {
      const categoryId = getUrlParams(req.url, 'categoryId') || 'all';
      const articles = categoryId === 'all' 
        ? INITIAL_CATEGORIES.slice(2, 6).flatMap(c => generateArticlesForCategory(c.id, INITIAL_CATEGORIES))
        : generateArticlesForCategory(categoryId, INITIAL_CATEGORIES);
      return {
        code: 200,
        msg: 'success',
        data: articles
      };
    }
  },

  // 获取标签列表
  {
    url: '/api/tag/list',
    method: 'get',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: INITIAL_TAGS
      };
    }
  },

  // 创建标签
  {
    url: '/api/tag/create',
    method: 'post',
    response: (req: any) => {
      const newTag = {
        id: `tag-${Date.now()}`,
        count: 0,
        ...req.body
      };
      return {
        code: 200,
        msg: 'success',
        data: newTag
      };
    }
  },

  // 更新标签
  {
    url: '/api/tag/update/:tagId',
    method: 'put',
    response: (req: any) => {
      const tagId = getUrlParams(req.url, 'tagId');
      const updatedTag = {
        id: tagId,
        ...req.body
      };
      return {
        code: 200,
        msg: 'success',
        data: updatedTag
      };
    }
  },

  // 删除标签
  {
    url: '/api/tag/delete/:tagId',
    method: 'delete',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: null
      };
    }
  },

  // 根据标签ID获取文章
  {
    url: '/api/tag/articles/:tagId',
    method: 'get',
    response: (req: any) => {
      const tagId = getUrlParams(req.url, 'tagId') || 'all';
      const articles = tagId === 'all' 
        ? INITIAL_TAGS.slice(0, 5).flatMap(t => generateArticlesForTag(t.id, INITIAL_TAGS))
        : generateArticlesForTag(tagId, INITIAL_TAGS);
      return {
        code: 200,
        msg: 'success',
        data: articles
      };
    }
  },

  // 获取资源列表
  {
    url: '/api/resource/list',
    method: 'get',
    response: (req: any) => {
      let filteredResources = [...ALL_MOCK_RESOURCES];
      
      // 按类型过滤
      if (req.query?.type && req.query.type !== 'all') {
        filteredResources = filteredResources.filter(item => item.type === req.query.type);
      }
      
      // 按搜索关键词过滤
      if (req.query?.searchQuery) {
        const searchLower = req.query.searchQuery.toLowerCase();
        filteredResources = filteredResources.filter(item => item.name.toLowerCase().includes(searchLower));
      }
      
      // 按关联状态过滤
      if (req.query?.linked !== undefined) {
        const isLinked = req.query.linked === 'true';
        filteredResources = filteredResources.filter(item => item.linked === isLinked);
      }
      
      // 分页处理
      const page = parseInt(req.query?.page || '1');
      const pageSize = parseInt(req.query?.pageSize || '24');
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedResources = filteredResources.slice(startIndex, endIndex);
      
      return {
        code: 200,
        msg: 'success',
        data: paginatedResources
      };
    }
  },

  // 创建资源
  {
    url: '/api/resource/create',
    method: 'post',
    response: (req: any) => {
      const newResource = {
        id: `res-${Date.now()}`,
        type: 'doc',
        size: `${(Math.random() * 10 + 0.5).toFixed(1)} MB`,
        date: new Date().toISOString().split('T')[0],
        linked: false,
        sourceArticle: null,
        ...req.body
      };
      return {
        code: 200,
        msg: 'success',
        data: newResource
      };
    }
  },

  // 更新资源
  {
    url: '/api/resource/update/:resourceId',
    method: 'put',
    response: (req: any) => {
      const resourceId = getUrlParams(req.url, 'resourceId');
      const updatedResource = {
        id: resourceId,
        ...req.body
      };
      return {
        code: 200,
        msg: 'success',
        data: updatedResource
      };
    }
  },

  // 删除资源
  {
    url: '/api/resource/delete/:resourceId',
    method: 'delete',
    response: () => {
      return {
        code: 200,
        msg: 'success',
        data: null
      };
    }
  },

  // 下载资源
  {
    url: '/api/resource/download/:resourceId',
    method: 'get',
    response: (req: any) => {
      const resourceId = getUrlParams(req.url, 'resourceId');
      return {
        code: 200,
        msg: 'success',
        data: {
          resourceId,
          downloadUrl: `https://example.com/downloads/${resourceId}`,
          fileName: `resource_${resourceId}.pdf`
        }
      };
    }
  }
] as MockMethod[];
