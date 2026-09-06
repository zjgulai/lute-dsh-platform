# Page Type Templates

本文件提供常见网页类型的数据审计与字段设计模板，用于提升 Skill 在不同站点、不同页面类型下的泛化能力。

使用方式：

1. 先判断当前页面属于哪一类
2. 用对应模板做首轮字段审计
3. 再根据真实样本做裁剪和修正
4. 不可直接把模板字段视为稳定可采字段，必须经过样本验证

---

## 1. 评论页模板

### 常见页面特征

- 有评分或星级
- 有评论标题和正文
- 有作者信息
- 有发布时间
- 可能有回复
- 可能有验证标签、体验日期、点赞等信息

### 常见业务目标

- 品牌口碑监控
- 差评预警
- 客服响应效率分析
- 用户反馈主题分析
- 区域市场体验对比

### 推荐最小字段集

#### 页面级

- platform
- business_name
- domain
- review_page_url
- trustscore / avg_rating
- total_reviews
- sort_mode
- snapshot_time

#### 明细级

- review_id
- review_url
- rating
- review_title
- review_body
- published_at_raw
- published_at
- author_name
- author_country
- review_type / verified_flag
- has_reply
- reply_at_raw
- reply_at
- reply_text

### 常见衍生指标

- 评论总量
- 平均星级
- 好评率 / 差评率
- 回复率
- 平均响应时长
- 差评回复率
- 情感占比
- 高频主题占比

### 常见风险点

- 相对时间文本
- 回复区动态展开
- 列表页和详情页字段不一致
- 分页与懒加载混合
- 多语言显示差异

### 自动化重点

- 分页方式识别
- 评论主键提取
- 回复时间提取
- 时间标准化
- 去重与覆盖率校验

---

## 2. 商品详情页模板

### 常见页面特征

- 商品标题
- 价格
- 图片
- 属性参数
- 库存状态
- SKU/规格
- 促销信息
- 可能带评价摘要

### 常见业务目标

- 商品信息采集
- 价格监控
- 竞品对比
- 卖点提炼
- 规格参数标准化

### 推荐最小字段集

#### 页面级 / 商品级

- product_id
- product_url
- product_name
- brand
- category
- price
- original_price
- currency
- availability
- sku
- variant_info
- rating_summary
- review_count
- crawl_time

### 常见衍生指标

- 折扣率
- 价格波动
- 缺货率
- 规格覆盖率
- 卖点关键词占比

### 常见风险点

- 价格随规格变化
- 图片与视频资源懒加载
- 规格切换后 DOM 变化
- 页面首屏与切换状态字段不一致

### 自动化重点

- 规格遍历
- 动态价格识别
- 商品主键稳定性
- 变体去重

---

## 3. 商品评价页模板

### 常见页面特征

- 商品级评分
- 用户评价列表
- 标题、正文、评分
- 购买时间/使用时间
- 图片评价
- 商家回复
- 筛选器与排序器

### 常见业务目标

- 用户反馈分析
- 产品问题识别
- 差评监控
- 评价主题建模

### 推荐最小字段集

- product_id
- product_name
- review_id
- rating
- review_title
- review_body
- published_at_raw
- published_at
- reviewer_name
- verified_purchase
- has_reply
- reply_at
- reply_text
- image_count

### 常见风险点

- 评价分页复杂
- 图片评价单独弹层
- 购买标签并非总是稳定展示
- 文本折叠导致正文不完整

### 自动化重点

- 展开完整评价
- 图片计数与链接采集
- 购买标识识别
- 列表页与详情页联动

---

## 4. 帖子页 / 论坛页模板

### 常见页面特征

- 帖子标题
- 正文内容
- 作者
- 发帖时间
- 回复楼层
- 点赞/收藏/浏览数
- 标签或板块信息

### 常见业务目标

- 舆情监控
- 内容主题识别
- 用户问题收集
- 社区互动分析

### 推荐最小字段集

#### 帖子级

- post_id
- post_url
- post_title
- post_body
- author_name
- published_at
- board_name
- tag_list
- like_count
- reply_count
- view_count

#### 回复级

- comment_id
- parent_post_id
- comment_body
- comment_author
- comment_published_at

### 常见风险点

- 回复分层嵌套
- 展开更多回复
- 点赞和浏览数动态变化
- 登录后字段更多

### 自动化重点

- 楼层结构解析
- 回复树处理
- 动态展开与懒加载

---

## 5. 列表页模板

### 常见页面特征

- 卡片列表
- 每项有标题、摘要、链接
- 可能有分页、筛选和排序
- 详情字段往往需要二跳

### 常见业务目标

- 批量发现目标对象
- 建立抓取入口池
- 做榜单/聚合分析

### 推荐最小字段集

- item_id
- item_url
- item_title
- item_subtitle
- price / score / status
- location
- list_rank
- page_number
- crawl_time

### 常见风险点

- 列表字段不完整
- 需要进入详情页补字段
- 排序影响数据覆盖
- 无限滚动导致漏抓

### 自动化重点

- 稳定翻页
- 去重入口链接
- 列表和详情联采

---

## 6. 招聘页模板

### 常见页面特征

- 职位名称
- 公司名称
- 地点
- 薪资
- 职位描述
- 发布时间
- 招聘类型

### 常见业务目标

- 招聘市场监测
- 薪资分析
- 岗位趋势分析
- 技能需求抽取

### 推荐最小字段集

- job_id
- job_url
- job_title
- company_name
- location
- salary_raw
- salary_min
- salary_max
- employment_type
- published_at
- job_description
- crawl_time

### 常见风险点

- 薪资文本格式不统一
- 跨地区显示差异
- 职位已下线但页面仍缓存

### 自动化重点

- 列表到详情页跳转
- 薪资标准化
- 下线职位识别

---

## 7. 房源页模板

### 常见页面特征

- 房源标题
- 价格
- 地址
- 面积
- 户型
- 图片
- 描述
- 经纪人信息

### 常见业务目标

- 房价监控
- 区域房源比较
- 房源特征抽取
- 上下架跟踪

### 推荐最小字段集

- listing_id
- listing_url
- title
- price
- currency
- address
- region
- area_size
- room_count
- property_type
- listing_status
- description
- crawl_time

### 常见风险点

- 同一房源重复上架
- 图片懒加载
- 地址不完整
- 房源下架状态不稳定

### 自动化重点

- 房源唯一键识别
- 价格变动记录
- 上下架状态更新

---

## 模板使用原则

1. 模板只是起点，不是最终字段表
2. 所有字段都必须经过真实样本审计
3. 优先输出最小可用字段集
4. 页面字段、明细字段、衍生字段必须分层
5. 发现关键时间字段时，应优先纳入评估
