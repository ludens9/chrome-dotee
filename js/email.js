// 상수 정의
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

// EmailService 객체 정의
const EmailService = {
  API_URL: 'https://api.emailjs.com/api/v1.0/email/send',
  PUBLIC_KEY: '5wn-prO2m11ltZdF7',
  SERVICE_ID: 'service_ukqvpjc',
  TEMPLATE_ID: 'template_ci84ax5',

  async sendEmail(templateParams) {
    try {
      if (!templateParams.to_email) {
        throw new Error('수신자 이메일 주소가 필요합니다');
      }

      const params = {
        to_name: templateParams.to_email.split('@')[0],
        to_email: templateParams.to_email,
        from_name: "Dotee",
        date: templateParams.date || '',
        weekday: templateParams.weekday || '',
        start_time: templateParams.start_time || '기록 없음',
        end_time: templateParams.end_time || '기록 없음',
        total_hours: templateParams.total_hours || '0.0',
        total_sessions: templateParams.total_sessions || '0',
        week_hours: templateParams.week_hours || '0.0',
        month_hours: templateParams.month_hours || '0.0',
        message: templateParams.message || ''
      };

      const payload = {
        service_id: this.SERVICE_ID,
        template_id: this.TEMPLATE_ID,
        user_id: this.PUBLIC_KEY,
        template_params: params
      };

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`이메일 발송 실패 (${response.status})`);
      }

      return true;
    } catch (error) {
      console.error('이메일 발송 실패:', error);
      throw error;
    }
  },

  async sendDailyReport() {
    try {
      const settings = await StorageManager.getSettings();
      if (!settings.email) {
        throw new Error('이메일 설정이 없습니다');
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      // 어제 날짜의 근무 기록
      const yesterdayRecords = await StorageManager.getWorkRecords(yesterday);
      const yesterdayTotal = yesterdayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
      
      // 통계 데이터 계산
      const weekTotal = await StorageManager.getWeeklyTotal(yesterday);
      const lastWeekTotal = await StorageManager.getLastWeekTotal(yesterday);
      const thisMonthTotal = await StorageManager.getMonthlyTotal(yesterday);
      const lastMonthTotal = await StorageManager.getLastMonthTotal(yesterday);

      const emailData = {
        to_email: settings.email,
        date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
        weekday: weekdays[yesterday.getDay()],
        start_time: yesterdayRecords.length ? 
          new Date(yesterdayRecords[0].startTime).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
          }) : '기록 없음',
        end_time: yesterdayRecords.length ? 
          new Date(yesterdayRecords[yesterdayRecords.length - 1].endTime).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
          }) : '기록 없음',
        total_hours: (yesterdayTotal / 3600).toFixed(1),
        total_sessions: yesterdayRecords.length,
        week_hours: (weekTotal / 3600).toFixed(1),
        last_week_hours: (lastWeekTotal / 3600).toFixed(1),
        month: yesterday.getMonth() + 1,
        month_hours: (thisMonthTotal / 3600).toFixed(1),
        last_month: ((yesterday.getMonth() + 11) % 12) + 1,
        last_month_hours: (lastMonthTotal / 3600).toFixed(1),
        message: getTimeBasedMessage(yesterdayTotal, yesterdayRecords.length > 0)
      };

      await this.sendEmail(emailData);
      return true;
    } catch (error) {
      console.error('일일 리포트 발송 실패:', error);
      throw error;
    }
  }
};

// 전역 객체에 할당
self.EmailService = EmailService; 