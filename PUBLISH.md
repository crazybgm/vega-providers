# 发布片源到 GitHub

Vega 应用从 GitHub 拉取片源扩展。本仓库需要推送后，应用内才能安装。

## 一、在 GitHub 创建仓库

1. 打开 <https://github.com/new>
2. 仓库名**必须**填 `vega-providers`（应用默认按这个名字查找）
3. 可见性选 **Public**（否则应用读不到 raw 文件）
4. **不要**勾选 "Add a README"（我们已有 `README.md`，勾了会产生冲突）
5. 点 **Create repository**

## 二、推送本仓库

在 `Vega-MultiVideo-Providers` 目录下执行：

```powershell
cd D:\Qoder\Projects\android\Vega-MultiVideo-CN\Vega-MultiVideo-Providers

# 1. 关联远程仓库（把 <你的用户名> 换成实际值）
git remote add origin https://github.com/<你的用户名>/vega-providers.git

# 2. 推送（分支已是 main，与应用默认一致）
git push -u origin main
```

推送时会要求登录 GitHub。用**个人访问令牌（PAT）**当密码，
不要用账号密码（GitHub 已停用密码认证）。

令牌需要 `repo` 权限。创建地址：<https://github.com/settings/tokens>

## 三、在应用里安装

1. 打开 Vega → **设置** → **片源工具** → **添加片源地址**
2. 填入（把 `<你的用户名>` 换成实际值）：
   ```
   <你的用户名>/vega-providers
   ```
3. 点确认。应用会去 `raw.githubusercontent.com` 拉 `manifest.json`，
   然后列出可用的 8 个片源。

也可以直接填完整清单地址：
```
https://raw.githubusercontent.com/<你的用户名>/vega-providers/main/manifest.json
```

## 四、验证是否成功

拉到片源列表后，界面应显示 8 项：

| 片源 | providerValue |
|---|---|
| XVideos | `xvideos` |
| Tube8 | `tube8` |
| KissJAV | `kissjav` |
| RedTube | `redtube` |
| YouPorn | `youporn` |
| xHamster | `xhamster` |
| PIGAV | `pigav` |
| SexBJCam | `sexbjcam` |

逐个点「安装」即可。

## 常见问题

**Q: 提示「无效的片源地址」**
- 仓库名必须是 `vega-providers`
- 仓库必须是 Public
- 分支必须是 `main`（不是 `master`）
- 确认推送成功：浏览器打开
  `https://raw.githubusercontent.com/<你的用户名>/vega-providers/main/manifest.json`
  应该能看到 JSON 内容

**Q: 推送后应用里还是旧的**
raw.githubusercontent.com 有 CDN 缓存，等几分钟再试。
也可以在片源管理器里点刷新。

**Q: 改了源码但应用没变化**
`dist/` 才是应用真正读取的文件。改完 `providers/` 下的源码后必须重新构建并推送：

```powershell
npm run build
git add dist
git commit -m "..."
git push
```

**Q: 某个片源点了没反应 / 播放失败**
先在本地测：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
npm test -- <providerValue>
```

各站点的已知限制见 `README.md`（例如 xHamster 与 SexBJCam 无下载能力）。
