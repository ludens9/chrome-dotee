document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  try {
    statusEl.textContent = '이메일 발송 중...';
    await sendDailyReport();
    statusEl.textContent = '이메일 발송 완료!';
    setTimeout(() => window.close(), 1000);
  } catch (error) {
    console.error('이메일 발송 실패:', error);
    statusEl.textContent = '이메일 발송 실패: ' + error.message;
    setTimeout(() => window.close(), 3000);
  }
}); 