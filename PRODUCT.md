# PRODUCT.md

## Users

采购团队内部使用，三类角色：

- **销售（Sales）**：新建客户、供应商、询价项；为询价项指派采购员。
- **采购员（Buyer）**：处理分配给自己的询价项：录入供应商报价、维护与销售/客户的沟通、推进询价项状态。
- **经理（Manager）**：审核与跟单；可读写所有数据。

工作环境：办公室内网，24-27 英寸显示器为主，附带 200-300 元的安卓/苹果手机。日常使用时长 6-10 小时，键盘 + 鼠标为主；通勤路上偶发用手机查看"待办任务"。

## Brand

本工具是 Directus 的子应用：URL 暴露、登录走 Directus 账号、布局与数据流必须跟 Directus 习惯一致；不引入第二种设计语言。

视觉气质：纸质工作台 / 采购票据 / 账本夹子。**不是** Notion 风格（彩边/玻璃），**不是** Linear 风格（深色玻璃），**不是** Stripe 风格（紫渐变）。一个朴素、稳、不打扰你的工具。

## Tone

简洁、不动情、不滥用感叹号。中文文案优先。错误用动词开头（"无法连接到服务"），不写诗意免责声明。

## Anti-references

- **拒绝** Inter / Geist / 自托管付费字体（系统字体优先；中文走 PingFang / 微软雅黑 / Noto Sans CJK SC）。
- **拒绝** 默认 SaaS 蓝（`#3b82f6` 系）或 Linear 紫。
- **拒绝** 渐变文字 + 玻璃拟态 + 卡片瀑布 + 大数字 hero metric 模板。
- **拒绝** uppercase letter-spaced "kicker" 标签（用等宽 + 前导横线替代）。
- **拒绝** 软阴影卡片族（拆 Hero / Standard / Inset 三档）。

## Strategic principles

1. **Restrained 配色**：暖纸底 + 单一赭石 accent（OKLCH 55° 14% chroma）。**不**用第二个饱和色。
2. **质感优先于装饰**：1px 描边 + 真实表格行高 + 系统字体；不用阴影堆量感。
3. **数据优先于 chrome**：浏览器视口里 80% 给数据，20% 给导航和操作。
4. **可访问性 = 标配**：键盘可达 + `aria-live` + 44px 触摸目标 + WCAG AA 对比度。
5. **快**：N+1 解除、AbortController 取消链、`prefers-reduced-motion` 兜底、bundle < 200kB gzip。

## Quality bar

**Flagship 内部工具**：日常 6-10 小时使用，必须能撑住一天的眼睛。**不**做品牌级 marketing polish（不追求 hero 动效 / 不做视频背景）；**做**耐用一致的工程级工艺（统一 token、统一状态模式、统一取消模式、统一文案动词）。
