# HOME
homepage

Jinkai Zhang（张晋恺 / The0xKa1）的个人主页，界面采用白、黑和克莱因蓝（`#002FA7`），项目媒体保留原色。除首屏中文姓名外，页面文案、按钮和无障碍标签均使用英文。
首屏姓名显示为 Jinkai Zhang，旁边以较小字号显示「(张晋恺)」，配合蓝色海面和 GitHub / Bilibili / Notes / Email 图标链接。
配图使用 `assets/images/klein-blue-ocean-v2.png`，桌面端双栏、手机端上下排列。
自我介绍放在独立的 About Me 区域，右侧预留一张 3:4 自拍照位置。
介绍中包含 ZJU3DV research intern 经历、Sida Peng / Xiaowei Zhou 导师链接，研究方向为 embodied intelligence。

海面使用轻微纹理位移与缓慢推移表现水流，保留原图配色。
鼠标悬浮会产生局部水纹，并平滑跟随鼠标；移出后逐渐恢复。
点击或轻点会从落点扩散出涟漪，最多叠加四组，约四秒后消散。
交互层也支持键盘：Tab 聚焦后按 Enter / Space 可从画面中心产生涟漪。
动画最多绘制 30 帧/秒，离开视口或切换到其它标签页时暂停；右下角可手动暂停。
暂停时同时停止鼠标交互，手机端保留纵向滚动与双指缩放。
系统启用“减少动态效果”、禁用 JavaScript 或 WebGL 不可用时显示原图。

海面交互回归检查：`node --test tests/ocean-motion.test.cjs`，覆盖悬浮、点击坐标、连续点击、
触屏 / 键盘输入、暂停、减少动态效果、离开视口、GPU 回退与画布比例。

项目分成 Research（科研项目）与 Just for fun（兴趣使然），采用可继续追加的紧凑卡片。
桌面端为左侧缩略图、右侧介绍和链接，手机端上下排列，不使用项目海报。

- 科研：[SuperNav](https://zju3dv.github.io/SuperNav/)，使用官网 overview 视频，静音自动循环播放，提供手机与桌面两种清晰度。
- 兴趣：[KINE-X](https://github.com/The0xKa1/KINE-X)，两段原速 GIF 可在同一卡片中切换。
- 兴趣：弦间，使用同步展示视频、谱面与三维指法的 GIF。

视频和 GIF 保留完整构图、原色和原始文件，不添加调色滤镜或色彩蒙层。
GIF 可切换播放/静态首帧，系统启用“减少动态效果”时默认显示静态首帧。
点击 GIF 可打开原尺寸素材；切换 KINE-X 演示时，隐藏的 GIF 切回静态首帧。
素材来源及原始时长见 `assets/projects/SOURCES.md`。
Notes、GitHub、Bilibili 和 Email 合并为页脚的一行链接，不再显示笔记占位区。

标题使用 Cormorant Garamond，正文使用 DM Sans，两个字体的 Latin WOFF2 文件均本地托管。
字体来自 Google Fonts，SIL Open Font License 见 `fonts/*-OFL.txt`。
About Me 正文使用 Shantell Sans Normal Regular，自我介绍中的姓名为 Zhang Jinkai。
首屏中文姓名使用 LXGW WenKai Regular，并将「(张晋恺)」所需字形提取为 WOFF2 子集。
两种字体均从上游仓库取得并本地加载，来源、版本与字体许可见 `fonts/SOURCES.md` 和相应 OFL 文件。
图标来自 Font Awesome Free 6.7.2，所用 SVG 和图标精简集合均保存在 `assets/icons/fontawesome/`，无需第三方脚本。
图标来源和许可见该目录的 `SOURCES.md` 与 `LICENSE.txt`。

后续增加项目时，复制对应分类里的一个 `article.project`，替换标题、媒体、文案、链接与唯一 ID 即可。
一张卡片使用一个 `data-reveal`，避免在卡片内部重复添加动画标记。

后续添加内容时，在需要滚动淡入淡出的独立内容块上加 `data-reveal`：

```html
<section data-reveal>
    <!-- 在这里添加实际内容 -->
</section>
```

内容进入视口时淡入并上移 24px，离开时淡出，反向滚动可重复触发。
将属性加在独立内容块上，避免包裹整页或嵌套使用。
系统启用“减少动态效果”、禁用 JavaScript 或打印页面时，内容直接显示。
