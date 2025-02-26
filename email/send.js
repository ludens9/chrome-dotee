// import 문 제거
// getTimeBasedMessage 함수는 messageUtil.js에서 전역으로 사용 가능

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
      
      const records = await StorageManager.getWorkRecords(yesterday);
      const totalSeconds = records ? records.reduce((sum, record) => sum + record.duration, 0) : 0;
      const weekTotal = await StorageManager.getWeeklyTotal(yesterday);
      const monthTotal = await StorageManager.getMonthlyTotal(yesterday);

      const emailData = {
        to_email: settings.email,
        date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
        weekday: weekdays[yesterday.getDay()],
        start_time: records?.length ? new Date(records[0].startTime).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        }) : '기록 없음',
        end_time: records?.length ? new Date(records[records.length - 1].endTime).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit'
        }) : '기록 없음',
        total_hours: (totalSeconds / 3600).toFixed(1),
        total_sessions: records?.length || 0,
        week_hours: (weekTotal / 3600).toFixed(1),
        month_hours: (monthTotal / 3600).toFixed(1),
        message: getTimeBasedMessage(totalSeconds, !!records?.length)
      };

      await this.sendEmail(emailData);
      console.log('일일 리포트 발송 완료');
      return true;
    } catch (error) {
      console.error('일일 리포트 발송 실패:', error);
      throw error;
    }
  }
};

// 전역 객체에 할당
self.EmailService = EmailService;

function getTimeBasedMessage(totalSeconds, hasRecord = true) {
    if (!hasRecord) {
        return `Had a good rest yesterday? Let's start fresh today! 😊
어제 푹 쉬었으니 오늘은 상쾌하게 시작해볼까? 😊`;
    }
    
    const hours = totalSeconds / 3600;
    
    if (hours < 4) {
        return `Yesterday was a short day! Shall we pump up the energy today? 🌱
어제는 짧게 일했네! 오늘은 좀 더 힘내볼까? 🌱`;
    } else if (hours < 8) {
        return `Nice job wrapping up yesterday! Let's make today another good one 🌟
어제 하루 잘 마무리했어! 오늘도 좋은 하루 만들어보자 🌟`;
    } else if (hours < 10) {
        return `You worked hard yesterday! Take it easy today, okay? ✨
어제 열심히 했으니 오늘은 적당히 쉬어가면서 하자 ✨`;
    } else {
        return `Wow, that was a long day yesterday! Remember to take breaks today 💪
어제 진짜 많이 일했다! 오늘은 틈틈이 쉬면서 하자 💪`;
    }
}

async function calculateWeeklyTotal(baseDate) {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const weekStart = new Date(baseDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const baseDateStr = baseDate.toISOString().split('T')[0];
        
        let weekTotal = 0;
        Object.entries(workRecords)
            .filter(([date]) => date >= weekStartStr && date <= baseDateStr)
            .forEach(([_, dayRecords]) => {
                weekTotal += dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
            });
        
        return weekTotal;
    } catch (error) {
        console.error('주간 합계 계산 실패:', error);
        return 0;
    }
}

async function calculateMonthlyTotal(baseDate) {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        
        const monthStartStr = monthStart.toISOString().split('T')[0];
        const baseDateStr = baseDate.toISOString().split('T')[0];
        
        let monthTotal = 0;
        Object.entries(workRecords)
            .filter(([date]) => date >= monthStartStr && date <= baseDateStr)
            .forEach(([_, dayRecords]) => {
                monthTotal += dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
            });
        
        return monthTotal;
    } catch (error) {
        console.error('월간 합계 계산 실패:', error);
        return 0;
    }
}

async function calculateDailyTotal(date) {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const dateStr = date.toISOString().split('T')[0];
        const dayRecords = workRecords[dateStr] || [];
        
        console.log('===== 일간 근무시간 계산 시작 =====');
        console.log(`날짜: ${dateStr}`);
        
        // 유효한 기록만 필터링
        const validRecords = dayRecords.filter(record => {
            const start = new Date(record.startTime);
            const end = new Date(record.endTime);
            const duration = Math.floor((end - start) / 1000);
            
            return start < end && duration > 0 && duration < 24 * 60 * 60;
        });
        
        // 시간순 정렬
        validRecords.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        
        console.log('유효한 기록:', validRecords.length, '개');
        
        let totalSeconds = 0;
        validRecords.forEach(record => {
            const start = new Date(record.startTime);
            const end = new Date(record.endTime);
            const duration = Math.floor((end - start) / 1000);
            
            console.log('세션 상세:', {
                시작: start.toLocaleTimeString(),
                종료: end.toLocaleTimeString(),
                시간: `${Math.floor(duration/3600)}시간 ${Math.floor((duration%3600)/60)}분`
            });
            
            totalSeconds += duration;
        });
        
        console.log('최종 계산 결과:', {
            총_초: totalSeconds,
            총_시간: `${Math.floor(totalSeconds/3600)}시간 ${Math.floor((totalSeconds%3600)/60)}분`
        });
        
        return totalSeconds;
    } catch (error) {
        console.error('일간 합계 계산 실패:', error);
        console.error('에러 상세:', error.stack);
        return 0;
    }
}

async function cleanupInvalidRecords() {
    try {
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        
        // 유효한 기록만 필터링
        const cleanedRecords = {};
        
        Object.entries(workRecords).forEach(([date, records]) => {
            // 1970년 데이터 제외
            if (date.startsWith('1970')) return;
            
            // 유효한 기록만 필터링
            const validRecords = records.filter(record => {
                return record.startTime && record.endTime && 
                       record.duration > 0 && record.duration < 24 * 60 * 60; // 24시간 이내
            });
            
            if (validRecords.length > 0) {
                cleanedRecords[date] = validRecords;
            }
        });
        
        // 정리된 데이터 저장
        await chrome.storage.local.set({ workRecords: cleanedRecords });
        console.log('데이터 정리 완료:', cleanedRecords);
        
        return cleanedRecords;
    } catch (error) {
        console.error('데이터 정리 실패:', error);
        return null;
    }
}

// 데이터 계산 함수들
async function calculateStats(baseDate) {
    try {
        const dateStr = new Date(baseDate).toLocaleDateString();
        const records = await StorageManager.getWorkRecords(dateStr);

        // 시간 계산
        const totalSeconds = records.reduce((total, record) => total + record.duration, 0);
        const weekTotal = await StorageManager.getWeeklyTotal(baseDate);
        const lastWeekTotal = await StorageManager.getWeeklyTotal(new Date(baseDate.getTime() - 7 * 24 * 60 * 60 * 1000));
        const monthTotal = await StorageManager.getMonthlyTotal(baseDate);
        const lastMonthTotal = await StorageManager.getMonthlyTotal(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, baseDate.getDate()));

        // 시간 포맷팅
        const times = {
            startTime: '기록 없음',
            endTime: '기록 없음'
        };

        if (records.length > 0) {
            times.startTime = new Date(records[0].startTime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            times.endTime = new Date(records[records.length - 1].endTime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return {
            records,
            times,
            stats: {
                totalSeconds,
                totalHours: (totalSeconds / 3600).toFixed(1),
                weekTotal: (weekTotal / 3600).toFixed(1),
                lastWeekTotal: (lastWeekTotal / 3600).toFixed(1),
                monthTotal: (monthTotal / 3600).toFixed(1),
                lastMonthTotal: (lastMonthTotal / 3600).toFixed(1)
            }
        };
    } catch (error) {
        console.error('통계 계산 실패:', error);
        throw error;
    }
}

async function sendWorkReport() {
    const state = await StorageManager.getWorkStatus();
    const now = new Date();
    
    // 현재 시간이 자정을 넘었다면 자정으로 종료 시간 설정
    let endTime;
    if (now.getHours() < new Date(state.startTime).getHours()) {
        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else {
        endTime = now;
    }

    const duration = endTime - new Date(state.startTime);
    
    const emailData = {
        start_time: new Date(state.startTime).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        }),
        end_time: endTime.toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        }),
        total_hours: (duration / (1000 * 60 * 60)).toFixed(1)
    };

    // ... send email logic ...
}

// 시간 포맷 함수
function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}시간 ${minutes}분`;
}

// ... existing code ... 