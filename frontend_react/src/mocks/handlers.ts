import { http, HttpResponse } from 'msw';
import { fakerZH_CN as faker } from '@faker-js/faker';
import { articleDemoData } from './articleDemoData';
import homepageDemoData from './homepageDemoData.json';

// --- 1. 中文技术词库 (让数据更真实) ---
const TECH_PREFIXES = ['深入理解', '精通', '从入门到放弃', '高并发', '企业级', '基于', '实战', '全栈开发', '30天学会'];
const TECH_KEYWORDS = ['React', 'Vue 3', 'Docker', 'Kubernetes', 'Spring Boot', '微服务', 'Redis', 'TypeScript', 'Next.js', 'Rust', 'Go语言', 'GraphQL'];
const TECH_SUFFIXES = ['原理解析', '最佳实践', '性能优化指南', '源码分析', '部署手册', '踩坑记录', '开发规范', '架构设计'];

const TAG_POOL = ['后端架构', '前端', 'DevOps', '数据库', '面试题', '算法', '开源', '随笔', 'UI设计', '云原生'];

// 生成中文标题
const generateChineseTitle = () => {
    return `${faker.helpers.arrayElement(TECH_PREFIXES)} ${faker.helpers.arrayElement(TECH_KEYWORDS)} ${faker.helpers.arrayElement(TECH_SUFFIXES)}`;
};

// 生成中文描述 (模拟一段技术摘要)
const generateChineseDesc = () => {
    const topic = faker.helpers.arrayElement(TECH_KEYWORDS);
    return `本文主要介绍了 ${topic} 的核心概念与应用场景。通过实际案例分析，详细讲解了在生产环境中遇到的问题及解决方案，适合中高级开发者阅读。`;
};

// --- 2. 模拟文章生成 ---
const generateArticle = (articleId: string) => {
  // 随机生成 1-3 个中文标签
  const randomTags = faker.helpers.arrayElements(TAG_POOL, { min: 1, max: 3 });
  
  return {
    id: faker.number.int({ min: 1, max: 1000 }),
    articleId,
    // 使用上面的中文生成器
    title: generateChineseTitle(), 
    content: generateChineseDesc(), // 简略内容
    desc: generateChineseDesc(),    // 列表页显示的描述
    
    collId: faker.string.alpha({ length: 8, casing: 'lower' }),
    author: faker.person.fullName(), // 中文人名
    createdAt: faker.date.past().toISOString().replace('T', ' ').substring(0, 19),
    updatedAt: faker.date.recent().toISOString().replace('T', ' ').substring(0, 19),
    isValid: true,
    permission: 'public',
    readCount: faker.number.int({ min: 100, max: 5000 }),
    categoryId: faker.string.alpha({ length: 8, casing: 'lower' }),
    sort: faker.number.int({ min: 0, max: 100 }),
    
    date: faker.date.recent().toISOString().split('T')[0], // YYYY-MM-DD
    readTime: faker.number.int({ min: 3, max: 25 }),
    collection: faker.datatype.boolean(),
    
    // 确保标签也是中文
    tags: randomTags.map((t, i) => ({ tagId: `t${i}`, name: t })), 
    // 兼容部分旧字段
    tagList: randomTags
  };
};

// --- 3. 模拟资源生成 ---
const generateMockResources = (count: number) => {
    const types = ['doc', 'image', 'video', 'audio', 'code', 'archive', 'design'];
    const names = ['需求说明书', '架构图', '会议纪要', '接口文档', '首页设计稿', '数据库备份', '演示视频', '验收报告'];
    
    return Array.from({ length: count }).map((_, i) => {
        const type = types[i % types.length];
        const nameIdx = i % names.length;
        const ext = type === 'doc' ? 'pdf' : type === 'image' ? 'png' : 'file';
        
        return {
            id: `res-${i}`,
            name: `${names[nameIdx]}_v${(i % 5) + 1}.${ext}`,
            type: type,
            size: `${(Math.random() * 10 + 0.5).toFixed(1)} MB`,
            date: `2025-11-${(Math.floor(Math.random() * 28) + 1).toString().padStart(2, '0')}`,
            linked: Math.random() > 0.5,
            sourceArticle: Math.random() > 0.5 ? { id: `art-${i}`, title: generateChineseTitle() } : null
        };
    });
};

const ALL_MOCK_RESOURCES = generateMockResources(200);

// --- 4. 静态分类与标签数据 ---
const INITIAL_CATEGORIES = [
    { id: 'all', name: '全部分类', count: 383, description: '浏览知识库所有文档', iconKey: 'Layers', themeId: 'slate', isSystem: true },
    { id: 'uncategorized', name: '未分类', count: 12, description: '暂未关联任何分类的文档', iconKey: 'Box', themeId: 'slate', isSystem: true },
    { id: 'tech', name: '技术研发', count: 128, description: '后端架构、前端开发及代码规范', iconKey: 'Server', themeId: 'blue' },
    { id: 'product', name: '产品设计', count: 64, description: 'PRD文档、UI设计稿及交互规范', iconKey: 'PenTool', themeId: 'pink' },
    { id: 'ops', name: '运维部署', count: 42, description: '服务器配置、Docker及CI/CD', iconKey: 'Database', themeId: 'emerald' },
    { id: 'marketing', name: '市场运营', count: 35, description: '活动策划、SEO及数据分析', iconKey: 'Globe', themeId: 'orange' },
];

const INITIAL_TAGS = [
    { tag_id: 'react', name: 'React', article_count: 45, themeId: 'blue' },
    { tag_id: 'vue', name: 'Vue.js', article_count: 32, themeId: 'emerald' },
    { tag_id: 'tailwind', name: 'Tailwind CSS', article_count: 28, themeId: 'cyan' },
    { tag_id: 'docker', name: 'Docker', article_count: 15, themeId: 'sky' },
    { tag_id: 'deploy', name: '自动化部署', article_count: 12, themeId: 'orange' },
    { tag_id: 'backend', name: '后端架构', article_count: 38, themeId: 'violet' },
    { tag_id: 'db', name: 'Database', article_count: 24, themeId: 'slate' },
    { tag_id: 'api', name: 'RESTful API', article_count: 19, themeId: 'pink' },
    { tag_id: 'perf', name: '性能优化', article_count: 9, themeId: 'amber' },
    { tag_id: 'linux', name: 'Linux', article_count: 42, themeId: 'slate' },
];

// --- Handlers 定义 ---

export const handlers = [
  // 1. 获取文章详情
  http.get('/api/article/detail/:articleId', ({ params }) => {
    const { articleId } = params;
    // 返回一个固定的详情数据，但ID匹配
    return HttpResponse.json({
      code: 200,
      msg: 'success',
      data: {
        id: 1,
        articleId: typeof articleId === 'string' ? articleId : '1',
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
        sort: 1,
        tags: articleDemoData.tags.map(t => ({ name: t, tagId: t }))
      }
    });
  }),

  // 2. 创建文章
  http.post('/api/article/create', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      code: 200,
      msg: 'success',
      data: {
        id: faker.number.int({ min: 1, max: 1000 }),
        articleId: faker.string.alpha({ length: 10, casing: 'lower' }),
        title: body.title,
        content: body.content,
        collId: body.collId,
        author: '张三',
        createdAt: faker.date.recent().toISOString(),
        updatedAt: faker.date.recent().toISOString(),
        isValid: true,
        permission: body.permission || 'public',
        readCount: 0,
        categoryId: body.categoryId,
        sort: body.sort || 0
      }
    });
  }),

  // 3. 更新文章
  http.put('/api/article/update/:articleId', async ({ params, request }) => {
    const { articleId } = params;
    const body = await request.json() as any;
    return HttpResponse.json({
      code: 200,
      msg: 'success',
      data: {
        id: faker.number.int(),
        articleId,
        title: body.title || faker.lorem.sentence(),
        content: body.content || faker.lorem.paragraph(),
        collId: faker.string.alpha(8),
        updatedAt: new Date().toISOString(),
        permission: body.permission || 'public'
      }
    });
  }),

  // 4. 删除文章
  http.delete('/api/article/delete/:articleId', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: null });
  }),

  // 5. 文章列表 (核心修改点：使用中文生成器)
  http.get('/api/article/list', ({ request }) => {
    const url = new URL(request.url);
    const collId = url.searchParams.get('collId');
    const keyword = url.searchParams.get('keyword');

    // 生成 10 条中文数据
    let articles = Array.from({ length: 10 }).map((_, i) => generateArticle(`art_${i}`));

    if (collId) {
      articles = articles.map(a => ({ ...a, collId }));
    }
    if (keyword) {
      articles = articles.filter(a => a.title.includes(keyword));
    }

    return HttpResponse.json({
      code: 200,
      msg: 'success',
      data: articles
    });
  }),

  // 6. 文集列表
  http.get('/api/anthology/list', () => {
    return HttpResponse.json({
      code: 200,
      msg: 'success',
      data: homepageDemoData
    });
  }),

  // 7. 创建文集
  http.post('/api/anthology/create', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      code: 200,
      msg: 'success',
      data: {
        id: faker.number.int({ min: 1, max: 1000 }),
        coll_id: `col_${faker.string.alpha({ length: 6, casing: 'lower' })}`,
        title: body.title,
        count: 0,
        icon_id: body.iconId || 'book',
        isTop: body.isTop || false,
        permission: body.permission || 'public',
        description: body.description,
        articles: [],
        sort: body.sort || 0
      }
    });
  }),

  // 8. 文集排序
  http.put('/api/anthology/:collId/sort', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: null });
  }),

  // 9. 更新文集
  http.put('/api/anthology/update/:collId', async ({ params, request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
        code: 200,
        msg: 'success',
        data: { ...body, coll_id: params.collId }
    });
  }),

  // 10. 删除文集
  http.delete('/api/anthology/delete/:collId', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: null });
  }),

  // 11. 分类列表
  http.get('/api/category/list', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: INITIAL_CATEGORIES });
  }),

  // 12. 创建分类
  http.post('/api/category/create', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
        code: 200,
        msg: 'success',
        data: { id: `cat-${Date.now()}`, count: 0, isSystem: false, ...body }
    });
  }),

  // 13. 更新分类
  http.put('/api/category/update/:categoryId', async ({ params, request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
        code: 200,
        msg: 'success',
        data: { id: params.categoryId, ...body }
    });
  }),

  // 14. 删除分类
  http.delete('/api/category/delete/:categoryId', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: null });
  }),

  // 15. 标签列表
  http.get('/api/tag/list', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: INITIAL_TAGS });
  }),

  // 16. 创建标签
  http.post('/api/tag/create', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
        code: 200,
        msg: 'success',
        data: { tag_id: `tag-${Date.now()}`, article_count: 0, ...body }
    });
  }),

  // 17. 更新标签
  http.put('/api/tag/update/:tagId', async ({ params, request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
        code: 200,
        msg: 'success',
        data: { tag_id: params.tagId, ...body }
    });
  }),

  // 18. 删除标签
  http.delete('/api/tag/delete/:tagId', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: null });
  }),

  // 19. 资源列表
  http.get('/api/resource/list', ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const searchQuery = url.searchParams.get('searchQuery');
    const linked = url.searchParams.get('linked');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '24');

    let filteredResources = [...ALL_MOCK_RESOURCES];

    if (type && type !== 'all') {
        filteredResources = filteredResources.filter(item => item.type === type);
    }
    if (searchQuery) {
        filteredResources = filteredResources.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (linked !== null) {
        const isLinked = linked === 'true';
        filteredResources = filteredResources.filter(item => item.linked === isLinked);
    }

    const paginatedResources = filteredResources.slice((page - 1) * pageSize, page * pageSize);

    return HttpResponse.json({ code: 200, msg: 'success', data: paginatedResources });
  }),

  // 20. 创建资源
  http.post('/api/resource/create', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
        code: 200,
        msg: 'success',
        data: {
            id: `res-${Date.now()}`,
            type: 'doc',
            size: `${(Math.random() * 10 + 0.5).toFixed(1)} MB`,
            date: new Date().toISOString().split('T')[0],
            linked: false,
            sourceArticle: null,
            ...body
        }
    });
  }),

  // 21. 删除资源
  http.delete('/api/resource/delete/:resourceId', () => {
    return HttpResponse.json({ code: 200, msg: 'success', data: null });
  }),

  // 22. 登录接口
  http.post('/api/auth/login', () => {
      return HttpResponse.json({
          code: 200,
          msg: 'success',
          data: {
              token: 'mock-jwt-token-123456',
              username: 'admin',
              avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
          }
      });
  })
];