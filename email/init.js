document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  try {
    statusEl.textContent = '이메일 발송 준비 중...';
    
    // 잠시 대기하여 모든 스크립트가 로드되도록 함
    await new Promise(resolve => setTimeout(resolve, 500));
    
    statusEl.textContent = '이메일 발송 중...';
    await EmailService.sendDailyReport();
    
    statusEl.textContent = '이메일 발송 완료!';
    setTimeout(() => window.close(), 1000);
  } catch (error) {
    console.error('이메일 발송 실패:', error);
    statusEl.textContent = '이메일 발송 실패: ' + error.message;
    setTimeout(() => window.close(), 3000);
  }
}); 