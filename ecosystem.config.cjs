// pm2 실행 설정 (실서버) — docs/08_배포가이드.md
// 알림 엔진·SQLite 때문에 인스턴스는 1개로 운영한다.
module.exports = {
  apps: [
    {
      name: 'sellerbricks-bot',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
