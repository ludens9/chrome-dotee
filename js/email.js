class EmailService {
  constructor() {
    this.API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
    this.PUBLIC_KEY = '5wn-prO2m11ltZdF7';
    this.SERVICE_ID = 'service_ukqvpjc';
    this.TEMPLATE_ID = 'template_ci84ax5';
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 5000; // 5초
  }

  async sendEmail(templateParams) {
    let retryCount = 0;

    // 데이터 전처리: 숫자 데이터를 문자열로 변환
    const processedParams = {
      ...templateParams,
      total_sessions: String(templateParams.total_sessions || 0),
    };

    console.log('Processed template params:', processedParams);

    while (retryCount < this.MAX_RETRIES) {
      try {
        // 네트워크 연결 확인
        if (!navigator.onLine) {
          await this.waitForOnline();
        }

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
            template_params: processedParams
          })
        });

        if (!response.ok) {
          throw new Error(`이메일 발송 실패: ${response.status}`);
        }

        return true;

      } catch (error) {
        retryCount++;
        console.error(`이메일 발송 시도 ${retryCount}/${this.MAX_RETRIES} 실패:`, error);

        if (retryCount === this.MAX_RETRIES) {
          // 모든 재시도 실패 시 큐에 저장
          await QueueManager.addToQueue('EMAIL', {
            templateParams: processedParams,
            timestamp: Date.now()
          });
          throw new Error('이메일 발송 실패. 오프라인 큐에 저장됨');
        }

        // 재시도 전 대기
        await this.delay(this.RETRY_DELAY);
      }
    }
  }

  async waitForOnline() {
    return new Promise(resolve => {
      if (navigator.onLine) {
        resolve();
        return;
      }

      const handleOnline = () => {
        window.removeEventListener('online', handleOnline);
        resolve();
      };

      window.addEventListener('online', handleOnline);
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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