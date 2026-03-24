# Generic llm translator

###### 自用的插件，分享给大家互相学习

这是一个面向 Bob 的高可定制翻译插件，支持两类后端：

- **Ollama**：适合本地部署、本地模型推理
- **通用接口**：适合兼容各种通用大模型协议的云端服务（目前仅测试了硅基流动）

插件支持流式输出、术语表、自定义场景风格、占位符保护、自动场景识别和一致性复检，适用于普通翻译、软件界面文案、本地化、论文写作和技术文档翻译。

## 功能特性

- 支持 **Ollama 本地接口**
- 支持 **通用兼容接口**
- 支持 **流式输出**
- 支持 **术语表**
- 支持 **场景风格控制**
- 支持 **占位符 / URL / 标签保护**
- 支持 **自动场景识别**
- 支持 **一致性复检**

---

## 一、本地部署：使用 Ollama

### 1. 安装 Ollama

如果你在 macOS 上使用 Ollama，官方推荐方式是下载 `ollama.dmg`，将应用拖入 `Applications`，首次启动后会自动检查并设置 CLI。Ollama 官方也提供 Windows、Linux 和 macOS 的快速开始说明。

### 2. 启动 Ollama

安装后，Ollama 默认会在本机提供 API 服务，默认基础地址是：

```text
http://localhost:11434/api
```

这意味着插件在 **Ollama 模式** 下，实际调用的是：

```text
http://localhost:11434/api/chat
```

### 3. 拉取模型

先在终端测试并拉取你要使用的模型。例如：

```bash
ollama pull qwen2.5
ollama run qwen2.5
```

或者根据你实际使用的模型名进行替换。Ollama CLI 支持直接运行模型，也支持菜单方式快速启动。

### 4. 验证本地 API 是否可用

在终端中执行：

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5",
  "messages": [
    { "role": "user", "content": "hello" }
  ]
}'
```

如果返回了模型回复，就说明本地部署成功。

---

## 二、在 Bob 中安装插件

- 导入插件 

将整个 `.bobplugin` 目录导入 Bob。  

---

## 三、如何在本地模式下配置插件

在 Bob 的插件设置中，建议这样填写：

### 接口类型

选择：

```text
Ollama
```

### API URL

填写：

```text
http://127.0.0.1:11434
```

注意不要写成 `http://127.0.0.1:11434/api`，因为插件内部会自动拼接 `/api/chat`。

**可选**：如果是使用Tailscale等vpn连接工作站上的ollama，可以使用其指定的ip和端口号

```text
http://100.xx.xxx.xx:11434
```



### API Key

本地 Ollama 一般可以留空。

### 模型名称

例如：

```text
qwen2.5
```

或你本地实际安装的模型名(这里推荐使用qwen3.5:4b，本地部署速度快，准确度很高)。

### 关闭思考模式

建议开启，可大幅提高速度。

### Keep Alive

用于热激活ollama，建议设置为：

```text
10m
```

或更长。这样可以让模型保持驻留，减少重复加载导致的首包变慢（每次调用需要拉取ollama，这样太慢了，常驻的话可以减少拉取的时间）。

---

## 四、插件是如何调用本地模型的

当你在 Bob 中选中一段文本并触发翻译时，插件会将文本包装成一组 `messages` 发给 Ollama：

```json
{
  "model": "qwen2.5",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

插件再从 `message.content` 中提取模型输出，并做清洗、占位符还原、候选筛选和可选的一致性复检。

---

## 五、推荐的本地使用方式

### 普通翻译

- 翻译模式（根据翻译场景进行专业性选择，默认不需要调整）：自动场景
- 速度模式（默认不需要调整）：平衡
- 启用流式输出 （开启后逐字打印翻译内容）：是
- 关闭思考模式：是
- 一致性复检（翻译之后的检验校准，如果追求精度并且不在乎速度的话可以开启）：否

### 软件界面文案

- 翻译模式：UI 文案
- 保护占位符：是
- 保留格式：是
- 术语表：建议填写

### 论文 / 技术写作

- 翻译模式：技术文档
- 场景设置：填写具体要求
- 一致性复检：可开启

---

## 六、如何切换到“通用接口”

除了本地 Ollama，这个插件还支持“通用接口”模式，也就是兼容 通用 **Chat Completions** 协议的服务。

### 1. 切换接口类型

在 Bob 插件设置中，将：

```text
接口类型 = 通用接口
```

### 2. API URL 的写法

对于通用接口，插件会自动拼接：

```text
/chat/completions
```

因此你在 `API URL` 中应填写到服务根，例如：

```text
https://your-provider.example/v1
```

这样插件最终会请求：

```text
https://your-provider.example/v1/chat/completions
```

### 3. API Key

通用接口通常需要 API Key，插件会按 Bearer Token 方式发送：

```text
Authorization: Bearer <YOUR_API_KEY>
```

---

## 七、以硅基流动为例：如何切换成通用模型

硅基流动（SiliconFlow）的官方接入文档明确给出了 OpenAI Compatible 的接入方式，包括：

- Base URL：`https://api.siliconflow.cn/v1`
- API Key：从账户页面获取
- Model ID：从模型列表获取

这正好对应本插件的“通用接口”模式。

### 配置示例

#### 接口类型

```text
通用接口
```

#### API URL

```text
https://api.siliconflow.cn/v1
```

#### API Key

填写你在硅基流动后台申请到的 key。

#### 模型名称

填写硅基流动支持的模型 ID。模型名称应以其官方模型列表为准。

#### Bearer 认证

建议开启。

### 验证方式

你可以先在命令行验证通用接口是否可用，再回到 Bob 填相同参数：

```bash
curl https://api.siliconflow.cn/v1/chat/completions   -H "Authorization: Bearer YOUR_API_KEY"   -H "Content-Type: application/json"   -d '{
    "model": "YOUR_MODEL_ID",
    "messages": [
      { "role": "user", "content": "Translate hello to Chinese." }
    ]
  }'
```

---

## 八、流式输出是怎么工作的

本插件支持流式输出：

- 在 **Ollama 模式** 下，使用流式聊天响应
- 在 **通用接口模式** 下，按兼容的流式返回解析

流式输出的好处是：

- 用户能更早看到部分结果
- 体感速度明显更快
- 更适合长文本翻译

但需要注意：

- 流式阶段展示的是**中间结果**
- 最终完成后，插件会再执行清洗与筛选
- 如果开启一致性复检，插件还可能在结束后再做一次最终修正

---

## 九、术语表怎么写

你可以在术语表输入框中逐行填写，例如：

```text
Services=服务
Plugin=插件
Favorites=收藏夹
Bob=Bob
Ollama=Ollama
```

插件会把这些规则注入到提示词中，要求模型遵循这些映射。这对 UI 本地化、产品文案一致性、学术术语统一尤其有帮助。

---

## 十、场景设置怎么用

场景设置适合补充高层风格要求。例如：

```text
目前正在写论文，请按照物理学术论文风格帮我翻译。
```

或：

```text
当前是在翻译软件界面，请保持简洁、自然、符合中文产品语言习惯。
```

插件会把这段内容加入提示词，与“翻译模式”一起约束输出风格。

---

## 十一、常见问题

### 1. 为什么 Ollama 模式下 API URL 不要写 `/api`

因为插件内部已经会自动拼接 `/api/chat`。

### 2. 为什么通用接口要写 `/v1`

因为插件在通用模式下会自动拼接 `/chat/completions`。大多数 OpenAI 兼容服务都要求以 `/v1` 作为 API 根，再调用 `/chat/completions`。

### 3. 为什么本地首轮会比较慢

常见原因是模型首次加载。Ollama 支持 `keep_alive`，适当延长驻留时间可以降低重复加载开销。

### 4. 如果想看日志怎么办

出现接口异常、模型拉取失败、服务未启动等问题时，优先参考 Ollama 官方的排障文档。

---

## 十二、一个推荐的最小可用配置

### 本地 Ollama

```text
接口类型：Ollama
API URL：http://127.0.0.1:11434
API Key：留空
模型名称：qwen3.5:4b
启用流式输出：是
关闭思考模式：是
Keep Alive：10m
```

### 硅基流动

```text
接口类型：通用接口
API URL：https://api.siliconflow.cn/v1
API Key：你的 SiliconFlow API Key
模型名称：你选择的模型 ID
启用流式输出：是
Bearer 认证：是
```



欢迎大家提出建议与交流
