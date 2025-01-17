class EmailService {
  constructor() {
    this.API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
    this.PUBLIC_KEY = 'Y-3LlcCV0nOOKq3cU';
    this.SERVICE_ID = 'service_wf6t5so';
    this.TEMPLATE_ID = 'template_vflcb3o';
  }

  async sendEmail(templateParams) {
    try {
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
}

// 전역 객체로 노출
window.EmailService = EmailService; 