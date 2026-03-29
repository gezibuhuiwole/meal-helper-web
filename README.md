# 做饭网页

这是从原来的微信小程序版本整理出来的纯静态网页版本，适合直接部署到 GitHub Pages。

## 当前开放功能
- 按早餐、午餐、晚餐选菜
- 菜品分类筛选
- 荤素筛选
- 实时统计热量、金额和需准备食材
- 浏览器本地保存上次选择

## 目录说明
- `index.html`：站点入口
- `assets/styles.css`：页面样式
- `assets/app.js`：前端交互逻辑
- `assets/catalog.json`：浏览器直接读取的菜品数据
- `tools/build_catalog.py`：从 `data/exports/catalog_master.csv` 重新生成 `assets/catalog.json`

## 本地预览
这个站点依赖 `fetch` 读取本地 JSON，不建议直接双击 `index.html` 用 `file://` 打开。

可以在项目目录运行：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/
```

## 部署到 GitHub Pages
1. 在 GitHub 新建一个空仓库。
2. 在这个项目目录初始化 git 并提交。
3. 把远程仓库地址设为你的 GitHub 仓库地址。
4. 推送到 `main` 分支。
5. 在 GitHub 仓库的 `Settings -> Pages` 里，选择 `Deploy from a branch`。
6. 分支选 `main`，目录选 `/ (root)`。
7. 保存后，GitHub 会生成一个站点网址。

通常网址会是：

```text
https://你的用户名.github.io/你的仓库名/
```
