# databot

一个具备网页聊天界面的数据研究代理，可通过集成大语言模型（LLM）来探索数据库并生成报告

## 前端（代码目录：frontend）

- **技术栈**: Vue 3 + TypeScript + Vite with Element Plus UI
- **国际化**：前端需要支持中文和英文（默认中文）在`frontend/src/locales`中定义了i18n的语言包，*注意：*前端显示的所有文字不要硬编码，都要在locales语言包中有相关的定义
- **多端支持**：前端需要支持桌面和移动端浏览器在`frontend/src/layouts`分别定义DesktopLayout.vue和MobileLayout.vue，*注意*使用响应式设计，保证多端显示正常
- **样式管理**：全局样式都放在`frontend/src/styles`，组件私有样式放在各自的.vue中
- **单元测试**: 前端所有的单元测试用例都要写在`frontend/tests`目录中
- **静态检查**：`ESLint`/`Stylelint`/`TypeScript Compiler`/`Prettier`
- **编译配置**: 在.env.production中配置，比如后台API和WS的相对地址

```
VITE_WS_URL=/ws
VITE_API_URL=/api
```

_运行所有前端静态检查和编译_： `cd frontend/ && pnpm run preflight`

## 后端（代码目录：backend）

- **技术栈**: Express.js v5 + prisma v7
- **日志**：日志模块在backend/src/util/logger.ts所有模块打印日志必须引用该模块
- **异常**：后端异常统一定义在backend/src/errors，新增异常必须在这里定义
- **配置**：配置模块在backend/src/base/config.ts，会加载.env中的配置（可被环境变量覆盖）
- **单元测试**: 后端所有的单元测试用例都要写在`backend/tests`目录中
- **静态检查**：`ESLint`/`TypeScript Compiler`/`Prettier`

_运行后端所有静态检查和编译_： `cd backend/ && pnpm run preflight`

## Bridge（代码目录：bridge）

- **技术栈**: Java 22 + Vert.x 4.5 + HikariCP
- **功能**：JDBC 数据库桥接服务，通过 HTTP 接口代理数据库连接和查询
- **日志**：使用 SLF4J + Logback，配置在`bridge/src/main/resources/logback.xml`
- **单元测试**: 所有单元测试用例写在`bridge/src/test`目录中
- **构建工具**：Maven + maven-shade-plugin 打 fat jar
- **镜像**：Dockerfile 为纯运行镜像（JRE），JAR 通过 docker-compose volume 挂载
- **静态检查**：`Spotless`（google-java-format 格式化）/ `Checkstyle`（自定义lint规则）/ `Java Compiler`

_运行所有静态检查和编译_： `cd bridge/ && mvn spotless:check checkstyle:check compile`

_自动修复格式_： `cd bridge/ && mvn spotless:apply`

**Review注意**:

- 忽略design/\*.pen

**注意**：必须要遵守以下编码规范：

- 禁止使用any类型
