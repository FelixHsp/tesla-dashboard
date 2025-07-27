# Tesla 仪表板

基于 TeslaMate 数据的现代化 Tesla 仪表板，使用 React + Next.js + shadcn/ui 构建。

## 功能特性

- 📊 行程列表展示
- 🗺️ 行程详情和轨迹地图（基于高德地图）
- 📱 响应式设计，支持移动端
- 🎨 现代化 UI 设计
- ⚡ 快速性能

## 技术栈

- **前端框架**: Next.js 14 (App Router)
- **UI 库**: shadcn/ui + Tailwind CSS
- **数据库**: PostgreSQL (TeslaMate)
- **地图服务**: 高德地图 API
- **编程语言**: TypeScript

## 环境要求

- Node.js 18 或更高版本（使用 Docker 部署时不需要本地安装）
- TeslaMate 已部署并运行（使用 Docker 部署时会自动包含数据库）
- 高德地图 API 密钥

## 安装步骤

### 1. 克隆项目

```bash
git clone <repository-url>
cd tesla-dashboard
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env.local` 文件并添加以下配置：

```env
# 数据库配置 (连接到TeslaMate数据库)
DB_HOST=your_nas_ip_or_localhost
DB_PORT=5432
DB_NAME=teslamate
DB_USER=teslamate
DB_PASSWORD=your_teslamate_db_password

# 高德地图API配置
NEXT_PUBLIC_AMAP_KEY=your_amap_api_key
NEXT_PUBLIC_AMAP_SECURITY_CODE=your_amap_security_code
```

### 4. 获取高德地图 API 密钥

1. 前往 [高德开放平台](https://lbs.amap.com/)
2. 注册账号并创建应用
3. 获取 `API Key` 和 `安全密钥`
4. 在应用设置中添加您的域名到白名单

### 5. 运行项目

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm run start
```

访问 http://localhost:3000 查看应用。

### 6. Docker 部署（推荐）

项目支持 Docker 部署，包含完整的 TeslaMate 数据库环境：

```bash
# 1. 复制环境变量示例文件并修改配置
cp .env.example .env
# 编辑 .env 文件，填入实际的配置值

# 2. 构建并启动所有服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
```

访问 http://localhost:3333 查看应用。

## 目录结构

```
tesla-dashboard/
├── app/                    # Next.js App Router 页面
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 首页 (行程列表)
│   ├── trip/[id]/         # 行程详情页
│   └── globals.css        # 全局样式
├── components/            # React 组件
│   ├── ui/               # shadcn/ui 组件
│   └── TripMap.tsx       # 地图组件
├── lib/                  # 工具函数和配置
│   ├── utils.ts          # 通用工具函数
│   └── database.ts       # 数据库连接和查询
└── package.json          # 项目配置
```

## 数据库表结构

应用连接到 TeslaMate 的 PostgreSQL 数据库，主要使用以下表：

- `trips`: 行程数据
- `positions`: GPS 位置数据
- `addresses`: 地址信息

## 自定义配置

### 修改地图样式

在 `components/TripMap.tsx` 中修改地图样式：

```javascript
mapStyle: 'amap://styles/normal',  // 可选：normal, dark, light 等
```

### 修改数据显示数量

在 `lib/database.ts` 的 `getTrips` 函数中修改 `LIMIT` 值：

```sql
LIMIT 50  -- 修改为您想要的数量
```

## 故障排除

### 数据库连接问题

1. 确认 TeslaMate 数据库正在运行
2. 检查网络连接和防火墙设置
3. 验证数据库凭据是否正确

### 地图不显示

1. 检查高德地图 API 密钥是否正确
2. 确认域名已添加到高德开放平台白名单
3. 检查浏览器控制台是否有错误信息

### 依赖安装问题

```bash
# 清除缓存并重新安装
rm -rf node_modules package-lock.json
npm install
```

## 开发计划

- [ ] 添加充电记录展示
- [ ] 实现数据可视化图表
- [ ] 添加车辆状态监控
- [ ] 支持多车辆切换
- [ ] 添加数据导出功能

## 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 许可证

MIT License 