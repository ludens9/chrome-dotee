class EmailService {
  constructor() {
    this.API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
    this.PUBLIC_KEY = 'Y-3LlcCV0nOOKq3cU';
    this.SERVICE_ID = 'service_wf6t5so';
    this.TEMPLATE_ID = 'template_vflcb3o';
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 5000; // 5초
  }

  async sendEmail(templateParams) {
    try {
      const payload = {
        service_id: this.SERVICE_ID,
        template_id: this.TEMPLATE_ID,
        user_id: this.PUBLIC_KEY,
        template_params: templateParams
      };
      
      console.log('Sending email payload:', payload);

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'chrome-extension://' + chrome.runtime.id
        },
        body: JSON.stringify({
          service_id: this.SERVICE_ID,
          template_id: this.TEMPLATE_ID,
          user_id: this.PUBLIC_KEY,
          accessToken: this.PUBLIC_KEY,
          template_params: {
            ...templateParams,
            'g-recaptcha-response': ''
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `이메일 발송 실패: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('이메일 발송 오류:', error);
      throw error;
    }
  }

  async getDailyReport(date) {
    try {
      // 처리된 기록 사용
      const { processedRecords = {} } = await chrome.storage.local.get('processedRecords');
      const records = processedRecords[date] || [];

      // 일간 총계 사용
      const { dailyTotals = {} } = await chrome.storage.local.get('dailyTotals');
      const totalHours = dailyTotals[date] || 0;

      return {
        date,
        records,
        totalHours: (totalHours / 3600).toFixed(1),
        totalSessions: records.length
      };
    } catch (error) {
      console.error('일간 리포트 생성 실패:', error);
      throw error;
    }
  }
} 