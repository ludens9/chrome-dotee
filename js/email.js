class EmailService {
  constructor() {
    this.API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
    this.PUBLIC_KEY = '5wn-prO2m11ltZdF7';
    this.SERVICE_ID = 'service_ukqvpjc';
    this.TEMPLATE_ID = 'template_ci84ax5';
  }

  validateEmail(email) {
    // 기본적인 이메일 형식 검사
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('유효하지 않은 이메일 주소입니다');
    }
    
    // 추가 유효성 검사
    if (email.length > 254) { // RFC 5321
      throw new Error('이메일 주소가 너무 깁니다');
    }
    
    const [localPart, domain] = email.split('@');
    if (localPart.length > 64) { // RFC 5321
      throw new Error('이메일 주소의 로컬 파트가 너무 깁니다');
    }
    
    return true;
  }

  async sendEmail(templateParams) {
    try {
      // 이메일 주소 유효성 검사
      if (!templateParams.to_email) {
        throw new Error('수신자 이메일 주소가 필요합니다');
      }

      // EmailJS 템플릿 파라미터 구성
      const params = {
        to_name: templateParams.to_email.split('@')[0],
        to_email: templateParams.to_email,
        from_name: "Dotee",
        date: templateParams.date || '',
        month: templateParams.month || new Date().getMonth() + 1,  // 현재 월
        last_month: templateParams.last_month || ((new Date().getMonth() || 12)),  // 이전 월
        weekday: templateParams.weekday || '',
        start_time: templateParams.start_time || '기록 없음',
        end_time: templateParams.end_time || '기록 없음',
        total_hours: templateParams.total_hours || '0.0',
        total_sessions: templateParams.total_sessions || '0',
        week_hours: templateParams.week_hours || '0.0',
        last_week_hours: templateParams.last_week_hours || '0.0',
        month_hours: templateParams.month_hours || '0.0',
        last_month_hours: templateParams.last_month_hours || '0.0',
        message: templateParams.message || '',
        has_record: templateParams.has_record ? 'true' : 'false',
        week_status: (templateParams.weekday || '') + '요일'
      };

      // EmailJS 요청 데이터 구조화
      const payload = {
        service_id: this.SERVICE_ID,
        template_id: this.TEMPLATE_ID,
        user_id: this.PUBLIC_KEY,
        template_params: params
      };

      console.log('이메일 발송 시도:', {
        수신자: params.to_email,
        날짜: params.date,
        월정보: {
          현재월: params.month,
          이전월: params.last_month
        },
        데이터: JSON.stringify(params, null, 2)
      });

      // 요청 전송
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`이메일 발송 실패 (${response.status}): ${errorText}`);
      }

      console.log('이메일 발송 성공');
      return true;

    } catch (error) {
      console.error('이메일 발송 실패:', {
        에러메시지: error.message,
        상세: error.stack
      });
      throw error;
    }
  }

  async sendDailyReport() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toLocaleDateString();

      const records = await StorageManager.getWorkRecords(dateStr);
      if (!records || !records.length) {
        console.log('전날 근무 기록 없음');
        return;
      }

      // 시간 계산
      const totalSeconds = records.reduce((sum, record) => sum + record.duration, 0);
      const weekTotal = await StorageManager.getWeeklyTotal(yesterday);
      const monthTotal = await StorageManager.getMonthlyTotal(yesterday);

      const emailData = {
        date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
        weekday: ['일', '월', '화', '수', '목', '금', '토'][yesterday.getDay()],
        start_time: new Date(records[0].startTime).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        end_time: new Date(records[records.length - 1].endTime).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        total_hours: (totalSeconds / 3600).toFixed(1),
        week_hours: (weekTotal / 3600).toFixed(1),
        month_hours: (monthTotal / 3600).toFixed(1),
        total_sessions: records.length
      };

      await this.sendEmail(emailData);
      console.log('일일 리포트 발송 완료');

    } catch (error) {
      console.error('일일 리포트 발송 실패:', error);
      throw error;
    }
  }
}

// 전역으로 내보내기
if (typeof window !== 'undefined') {
  window.EmailService = EmailService;
} 