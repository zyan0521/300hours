# Webhook 自动部署教程

## 原理概述

每次 `git push` 到 GitHub 后，GitHub 会向 VPS 上的 webhook 服务发送一个 POST 请求，webhook 收到后执行部署脚本，自动拉取最新代码。

你的数据存储在浏览器 `localStorage` 中，更新服务器文件**不会**影响用户数据。

---

## 1. VPS 上创建部署脚本

在 VPS 上创建一个部署脚本，webhook 会调用它。

```bash
sudo tee /root/deploy-300hours.sh << 'SCRIPT'
#!/bin/bash

PROJECT_DIR="/var/www/300hours"
GIT_REPO="https://github.com/zyan0521/300hours.git"

echo "[$(date)] 开始部署..."

# 如果目录不存在则克隆，否则拉取
if [ ! -d "$PROJECT_DIR" ]; then
    git clone "$GIT_REPO" "$PROJECT_DIR"
else
    cd "$PROJECT_DIR"
    # 暂存本地修改（如果有），并拉取最新代码
    git stash
    git pull origin main
fi

# 设置目录权限（根据你的 web 服务器用户调整）
chown -R www-data:www-data "$PROJECT_DIR" 2>/dev/null || true

echo "[$(date)] 部署完成"
SCRIPT

chmod +x /root/deploy-300hours.sh
```

如果你配置了 SSH key（推荐），可以把远程地址换成 SSH 格式：
```bash
GIT_REPO="git@github.com:zyan0521/300hours.git"
```

---

## 2. 配置 webhook

你的 VPS 已安装 `webhook`。通常是安装这个 Go 写的工具：<https://github.com/adnanh/webhook>

### 创建 webhook 配置文件

```bash
sudo tee /etc/webhook/hooks.json << 'EOF'
[
  {
    "id": "deploy-300hours",
    "execute-command": "/root/deploy-300hours.sh",
    "command-working-directory": "/var/www/300hours",
    "response-message": "部署已触发",
    "trigger-rule": {
      "match": {
        "type": "value",
        "value": "refs/heads/main",
        "parameter": {
          "source": "payload",
          "name": "ref"
        }
      }
    }
  }
]
EOF
```

这个配置只会在 `main` 分支推送时触发，避免其他分支的推送也触发部署。

### 启动 webhook 服务

**方式一：使用 systemd 服务（推荐）**

```bash
sudo tee /etc/systemd/system/webhook.service << 'EOF'
[Unit]
Description=Webhook Service
After=network.target

[Service]
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.json -port 9000 -verbose
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now webhook
sudo systemctl status webhook
```

**方式二：直接命令行启动**

```bash
webhook -hooks /etc/webhook/hooks.json -port 9000 -verbose &
```

webhook 默认监听 `0.0.0.0:9000`，webhook 端点地址为：
```
http://你的VPS_IP:9000/hooks/deploy-300hours
```

### 可选：使用 nginx 反代（推荐）

如果你 VPS 上已经有 nginx 运行，可以配置反向代理并加一层安全验证：

```nginx
# 在 nginx 配置中添加
location /webhook/ {
    proxy_pass http://127.0.0.1:9000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

同时给 webhook 加上 secret token：

```bash
# 在 hooks.json 中添加 secret
{
  "id": "deploy-300hours",
  "execute-command": "/root/deploy-300hours.sh",
  "command-working-directory": "/var/www/300hours",
  "response-message": "部署已触发",
  "trigger-rule": {
    "match": {
      "type": "value",
      "value": "refs/heads/main",
      "parameter": {
        "source": "payload",
        "name": "ref"
      }
    }
  },
  "trigger-rule-mismatch-as-error": true,
  "pass-arguments-to-command": []
}
```

更好的方式是用 webhook 内置的 `--secret` 参数：

```bash
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.json -port 127.0.0.1:9000 -verbose -secret 你的自定义密钥
```

---

## 3. GitHub 仓库配置 Webhook

1. 打开你的 GitHub 仓库：https://github.com/zyan0521/300hours
2. 进入 **Settings → Webhooks → Add webhook**
3. 填写：
   - **Payload URL**: `http://你的VPS_IP:9000/hooks/deploy-300hours`
   - **Content type**: `application/json`
   - **Secret**: （如果你给 webhook 设置了 `-secret` 参数，在这里填写相同的密钥）
   - **Which events?**: 选择 **Just the push event**
   - **Active**: 勾选
4. 点击 **Add webhook**

![GitHub Webhook 配置示意图](https://docs.github.com/assets/cb-30363/images/help/settings/webhook-config.png)

---

## 4. 测试

在本地推送一次代码：

```bash
git add .
git commit -m "test webhook"
git push origin main
```

推到 GitHub 后：
1. GitHub 会立即向 webhook 发送 POST 请求
2. webhook 收到请求，匹配 `refs/heads/main` 后执行部署脚本
3. `deploy-300hours.sh` 会 git pull 最新代码

### 验证

```bash
# 查看 webhook 日志
journalctl -u webhook -f

# 或者看看部署脚本的输出
# webhook 默认将输出打印到 stdout
```

也可以在 GitHub 仓库的 **Settings → Webhooks** 中点击你添加的 webhook，查看 **Recent Deliveries**。

---

## 5. 关于本地数据安全的说明

这个项目是纯前端 PWA，所有用户数据（任务列表、计时记录）存储在浏览器的 **localStorage** 中，**与服务器文件完全独立**。

- 更新服务器的 `index.html`、`app.js`、`styles.css` 等静态文件 → **不会**影响用户数据
- 用户浏览器下次打开页面时会自动加载新文件
- Service Worker 会缓存静态资源，更新后会自动检测新版本并更新缓存

你唯一要注意的是：

> **不要**清空或重置 VPS 上的项目目录时，不会影响用户数据（数据在用户浏览器中）。

---

## 进阶

### 部署后发送通知

可以在部署脚本末尾加入通知：

```bash
# 飞书/Lark 通知
curl -X POST https://open.feishu.cn/open-apis/bot/v2/hook/你的webhook地址 \
  -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"300hours 已自动部署完成"}}'

# 或者企业微信通知
# ...
```

### 健康检查

在 hooks.json 中加一个健康检查端点：

```json
{
  "id": "health",
  "execute-command": "/bin/true",
  "response-message": "OK",
  "trigger-rule": {
    "match": {
      "type": "value",
      "value": "health",
      "parameter": {
        "source": "url",
        "name": "name"
      }
    }
  }
}
```

然后访问 `http://你的VPS_IP:9000/hooks/health` 可以检查服务是否存活。
