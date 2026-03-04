pipeline {
    agent any

    environment {
        APP_NAME    = 'yuehai-app'
        DEPLOY_DIR  = '/www/wwwroot/yuehai.qianshao.ai'
        APP_PORT    = '3001'
        NODE_ENV    = 'production'
        // 从 Jenkins Credentials 注入（ID 需与凭据页面一致）
        SUPABASE_URL              = credentials('SUPABASE_URL')
        SUPABASE_ANON_KEY         = credentials('SUPABASE_ANON_KEY')
        SUPABASE_SERVICE_ROLE_KEY = credentials('SUPABASE_SERVICE_ROLE_KEY')
        ZHIPU_API_KEY             = credentials('ZHIPU_API_KEY')
    }

    // NodeJS 名称需与 Jenkins → Global Tool Configuration 中配置的名称一致
    tools {
        nodejs 'node'
    }

    options {
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Checkout') {
            steps {
                echo "==> 拉取代码 from GitHub"
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                echo "==> 安装依赖"
                sh 'node -v && npm -v'
                sh 'npm ci --include=dev'
            }
        }

        stage('Build') {
            steps {
                echo "==> 构建 Next.js（standalone 模式）"
                sh 'npm run build'
            }
        }

        stage('Deploy') {
            steps {
                echo "==> 部署到 ${DEPLOY_DIR}"
                sh """
                    # 创建目标目录
                    mkdir -p ${DEPLOY_DIR}

                    # 复制 standalone 产物
                    rsync -a --delete .next/standalone/ ${DEPLOY_DIR}/

                    # standalone 需要手动补充 static 和 public
                    rsync -a .next/static/ ${DEPLOY_DIR}/.next/static/
                    rsync -a public/       ${DEPLOY_DIR}/public/

                    # 写入生产环境变量（由 Jenkins Credentials 注入）
                    cat > ${DEPLOY_DIR}/.env.local <<'ENVEOF'
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ZHIPU_API_KEY=${ZHIPU_API_KEY}
ENVEOF

                    # 确保 ecosystem 配置在部署目录中
                    cp ecosystem.config.js ${DEPLOY_DIR}/ecosystem.config.js
                """
            }
        }

        stage('Start / Reload PM2') {
            steps {
                echo "==> 用 PM2 启动或热重载应用"
                sh """
                    cd ${DEPLOY_DIR}

                    # 如果进程不存在则启动，否则热重载（零停机）
                    if pm2 describe ${APP_NAME} > /dev/null 2>&1; then
                        pm2 reload ecosystem.config.js --update-env
                    else
                        pm2 start ecosystem.config.js
                    fi

                    # 保存进程列表，使服务器重启后自动恢复
                    pm2 save
                """
            }
        }

        stage('Health Check') {
            steps {
                echo "==> 健康检查"
                sh """
                    sleep 5
                    curl -sf http://localhost:${APP_PORT} > /dev/null && \
                        echo "✅ 健康检查通过" || \
                        (echo "❌ 健康检查失败"; exit 1)
                """
            }
        }
    }

    post {
        success {
            echo "✅ 部署成功 — ${env.BUILD_URL}"
        }
        failure {
            echo "❌ 部署失败，请查看日志：${env.BUILD_URL}console"
        }
        always {
            cleanWs()
        }
    }
}
