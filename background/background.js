// ES 모듈 import 제거
importScripts(
  '../js/storage.js',
  '../js/email.js',
  '../js/messageUtil.js'
);

// 상수 정의
const Commands = {
  START_WORK: 'START_WORK',
  STOP_WORK: 'STOP_WORK',
  GET_STATUS: 'GET_STATUS',
  SET_AUTO_STOP: 'SET_AUTO_STOP'
};

const Events = {
  STATUS_UPDATED: 'STATUS_UPDATED',
  TIMER_TICK: 'TIMER_TICK',
  WORK_COMPLETED: 'WORK_COMPLETED',
  DAY_CHANGED: 'DAY_CHANGED'
};

const DefaultState = {
  isWorking: false,
  startTime: null,
  currentSession: 0,
  totalToday: 0,
  savedTotalToday: 0
};

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

class IconAnimator {
  constructor() {
    this.isAnimating = false;
    this.currentFrame = 0;
    this.animationInterval = null;
    this.defaultIcon = { 
      path: {
        "16": chrome.runtime.getURL("assets/icons/icon-default-16.png"),
        "48": chrome.runtime.getURL("assets/icons/icon-default-48.png"),
        "128": chrome.runtime.getURL("assets/icons/icon-default-128.png")
      }
    };
    this.animationFrames = [
      { path: { "16": chrome.runtime.getURL("assets/icons/icon-16-1.png") } },
      { path: { "16": chrome.runtime.getURL("assets/icons/icon-16-2.png") } },
      { path: { "16": chrome.runtime.getURL("assets/icons/icon-16-3.png") } },
      { path: { "16": chrome.runtime.getURL("assets/icons/icon-16-4.png") } }
    ];

    // 생성자에서 기본 아이콘 설정
    this.resetToDefault();
  }

  resetToDefault() {
    // 애니메이션 중지
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    this.isAnimating = false;
    this.currentFrame = 0;

    // 기본 아이콘 설정 (여러 사이즈 지원)
    chrome.action.setIcon(this.defaultIcon).catch(error => {
      console.error('Failed to set default icon:', error);
    });
  }

  startAnimation() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.currentFrame = 0;
    
    chrome.action.setIcon(this.animationFrames[0]).catch(error => {
      console.error('Failed to set initial animation frame:', error);
      this.resetToDefault();
      return;
    });
    
    this.animationInterval = setInterval(() => {
      try {
        this.currentFrame = (this.currentFrame + 1) % this.animationFrames.length;
        chrome.action.setIcon(this.animationFrames[this.currentFrame]).catch(error => {
          console.error('Failed to set animation frame:', error);
          this.resetToDefault();
        });
      } catch (error) {
        console.error('Icon animation error:', error);
        this.resetToDefault();
      }
    }, 250);
  }
}

class WorkManager {
  constructor() {
    this.state = { ...DefaultState };
    this.timer = null;
    this.iconAnimator = new IconAnimator();
    this.initialize();
    this.setupMessageListeners();
    this.setupAlarmListener();
    this.setupMidnightReset();
    this.setupEmailAlarm();
  }

  async initialize() {
    const saved = await StorageManager.getWorkStatus();
    if (saved) {
      this.state = { ...DefaultState, ...saved };
      if (this.state.isWorking) {
        this.startTimer();
        this.iconAnimator.startAnimation();
      } else {
        // 근무 중이 아닐 때는 무조건 기본 아이콘으로 설정
        this.iconAnimator.resetToDefault();
      }
    } else {
      // 저장된 상태가 없을 때도 기본 아이콘으로 설정
      this.iconAnimator.resetToDefault();
    }
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        (async () => {  // 비동기 처리를 위한 즉시실행 async 함수
            try {
                switch (message.type) {
                    case Commands.START_WORK:
                        await this.startWork(message.data);
                        sendResponse({ success: true });
                        break;
                    case Commands.STOP_WORK:
                        await this.stopWork();
                        sendResponse({ success: true });
                        break;
                    case Commands.GET_STATUS:
                        sendResponse(this.state);
                        break;
                    case Commands.SET_AUTO_STOP:
                        await this.setAutoStop(message.data);
                        sendResponse({ success: true });
                        break;
                    case 'SETUP_EMAIL_ALARM':
                        await this.setupEmailAlarm();
                        sendResponse({ success: true });
                        break;
                    case 'TEST_EMAIL_REPORT':
                        try {
                            await chrome.tabs.create({
                                url: chrome.runtime.getURL('email/send.html')
                            });
                            console.log('이메일 발송 페이지 열림');
                            sendResponse({ success: true });
                        } catch (error) {
                            console.error('이메일 발송 테스트 실패:', error);
                            sendResponse({ success: false, error: error.message });
                        }
                        break;
                }
            } catch (error) {
                console.error('Message handling error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;  // 비동기 응답을 위해 true 반환
    });
  }

  startTimer() {
    if (this.timer) return;
    
    this.timer = setInterval(async () => {
      if (!this.state.startTime) return;
      
      const now = new Date();
      // 현재 세션 시간 계산 (초 단위)
      const sessionSeconds = Math.floor((now - new Date(this.state.startTime)) / 1000);
      this.state.currentSession = sessionSeconds;
      
      // 총 누적시간 계산 (초 단위)
      const savedSeconds = this.state.savedTotalToday || 0;
      const totalSeconds = savedSeconds + sessionSeconds;
      this.state.totalToday = totalSeconds;
      
      // 디버깅을 위한 로그
      console.log('Timer Update:', {
        currentSession: this.formatTime(sessionSeconds),
        savedTotal: this.formatTime(savedSeconds),
        totalToday: this.formatTime(totalSeconds)
      });
      
      await this.saveAndNotify();
    }, 1000);
  }

  // 시간 포맷팅 헬퍼 함수
  formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async startWork(data = {}) {
    this.state = {
      ...this.state,
      isWorking: true,
      startTime: new Date().toISOString(),
      currentSession: 0,
      savedTotalToday: this.state.totalToday || 0,
      autoStopHours: data.autoStopHours !== null ? data.autoStopHours : (this.state.autoStopHours || 0)
    };
    
    this.startTimer();
    this.iconAnimator.startAnimation();
    await this.saveAndNotify();
    
    if (this.state.autoStopHours > 0) {
      this.setupAutoStop();
    }
  }

  async stopWork() {
    if (!this.state.isWorking) return;

    const sessionDuration = this.state.currentSession;
    const prevAutoStopHours = this.state.autoStopHours;
    
    console.log('근무 종료 시점 상태:', {
        세션시간: sessionDuration,
        시작시간: this.state.startTime,
        종료시간: new Date().toISOString()
    });
    
    this.state = {
        ...DefaultState,
        totalToday: this.state.totalToday,
        autoStopHours: prevAutoStopHours
    };
    
    this.stopTimer();
    this.iconAnimator.resetToDefault(); // stopAnimation 대신 resetToDefault 사용
    await this.saveAndNotify();

    const record = {
        duration: sessionDuration,
        startTime: this.state.startTime,
        endTime: new Date().toISOString()
    };
    console.log('저장되는 근무 기록:', record);
    
    await StorageManager.saveWorkRecord(record);
  }

  async saveAndNotify() {
    await StorageManager.saveWorkStatus(this.state);
    try {
      // 상태 업데이트 로그
      console.log('Current state:', {
        currentSession: this.state.currentSession,
        totalToday: this.state.totalToday,
        isWorking: this.state.isWorking
      });
      
      // 메시지 전송 시도 (실패는 무시)
      chrome.runtime.sendMessage({
        type: Events.STATUS_UPDATED,
        data: this.state
      }).catch(() => {
        // 팝업이 닫혀있는 경우 무시
      });
    } catch (error) {
      console.log('Notification skipped - popup might be closed');
    }
  }

  async setAutoStop(hours) {
    // 기존 알람 제거
    await chrome.alarms.clear('autoStop');
    
    // 새로운 알람 설정
    if (hours > 0) {
      this.state.autoStopHours = hours;
      await this.saveAndNotify();
      this.setupAutoStop();
    } else {
      this.state.autoStopHours = 0;
      await this.saveAndNotify();
    }
  }

  setupAutoStop() {
    const minutes = this.state.autoStopHours * 60;
    console.log('Setting up auto stop alarm:', {
      hours: this.state.autoStopHours,
      minutes: minutes,
      scheduledTime: new Date(Date.now() + minutes * 60 * 1000)
    });
    chrome.alarms.create('autoStop', {
      delayInMinutes: minutes
    });
  }

  async handleAutoStop() {
    console.log('Auto stop alarm triggered');
    await this.stopWork();
    chrome.runtime.sendMessage({ type: Events.WORK_COMPLETED });
  }

  async setupEmailAlarm() {
    try {
      // 기존 알람 제거
      await chrome.alarms.clear('emailReport');
      
      // 저장된 설정 가져오기
      const settings = await chrome.storage.local.get(['email', 'reportTime']);
      if (!settings.email || !settings.reportTime) {
        console.log('이메일 알람 설정 실패: 설정 없음');
        return;
      }
      
      // 다음 발송 시간 계산
      const [hours, minutes] = settings.reportTime.split(':').map(Number);
      const now = new Date();
      const scheduledTime = new Date(now);
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      // 이미 지난 시간이면 다음 날로 설정
      if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }
      
      // 알람 생성
      const delayInMinutes = Math.floor((scheduledTime - now) / 1000 / 60);
      await chrome.alarms.create('emailReport', {
        delayInMinutes: delayInMinutes,
        periodInMinutes: 24 * 60  // 24시간마다 반복
      });

      console.log('이메일 알람 설정 완료:', {
        발송시간: settings.reportTime,
        다음발송: scheduledTime,
        대기시간: delayInMinutes
      });
    } catch (error) {
      console.error('이메일 알람 설정 실패:', error);
    }
  }

  setupAlarmListener() {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      try {
        if (alarm.name === 'autoStop') {
          await this.handleAutoStop();
        } else if (alarm.name === 'midnight') {
          await this.handleMidnightReset();
        } else if (alarm.name === 'emailReport') {
          await this.sendDailyReport();  // 직접 이메일 발송
        }
      } catch (error) {
        console.error('Alarm handling error:', error);
      }
    });
  }

  setupMidnightReset() {
    // 다음 자정 시간 계산
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    // 자정 알람 설정
    const minutesUntilMidnight = Math.floor((tomorrow - now) / 1000 / 60);
    chrome.alarms.create('midnight', {
      delayInMinutes: minutesUntilMidnight,
      periodInMinutes: 24 * 60  // 24시간마다 반복
    });
  }

  async handleMidnightReset() {
    console.log('자정 리셋 시작:', {
        현재상태: this.state,
        현재시간: new Date().toISOString()
    });

    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    const dateStr = previousDate.toISOString().split('T')[0];

    // 작업 중이었다면 이전 날짜 기록 저장
    if (this.state.isWorking) {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        
        const previousDaySession = Math.floor((midnight - new Date(this.state.startTime)) / 1000);
        
        const record = {
            date: dateStr,
            duration: previousDaySession,
            startTime: this.state.startTime,
            endTime: midnight.toISOString()
        };
        
        console.log('자정 리셋 시 저장되는 기록:', record);
        await StorageManager.saveWorkRecord(record);
    }

    // 새로운 날짜의 세션 시작
    const newStartTime = midnight.toISOString();
    const currentTime = new Date();
    const newSessionDuration = Math.floor((currentTime - midnight) / 1000);

    this.state = {
        ...this.state,
        startTime: newStartTime,
        currentSession: newSessionDuration,
        savedTotalToday: newSessionDuration,  // 새로운 날의 누적 시간 시작
        totalToday: newSessionDuration
    };

    console.log('자정 리셋 완료:', {
        저장된날짜: dateStr,
        새로운상태: this.state
    });

    await this.saveAndNotify();
  }

  async sendDailyReport() {
    try {
        const settings = await chrome.storage.local.get(['email', 'reportTime']);
        if (!settings.email) return;

        // 어제 날짜 계산
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        // 어제의 근무 기록 가져오기
        const { workRecords = {} } = await chrome.storage.local.get('workRecords');
        const yesterdayRecords = workRecords[yesterdayStr] || [];

        // 근무 시간 계산
        let startTime = '기록 없음';
        let endTime = '기록 없음';
        let totalSeconds = 0;

        if (yesterdayRecords.length > 0) {
            startTime = new Date(yesterdayRecords[0].startTime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            endTime = new Date(yesterdayRecords[yesterdayRecords.length - 1].endTime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            totalSeconds = yesterdayRecords.reduce((total, record) => total + record.duration, 0);
        }

        // 주간/월간 통계 계산
        const weekTotal = await calculateWeeklyTotal(yesterday);
        const lastWeekTotal = await calculateWeeklyTotal(new Date(yesterday.getTime() - 7 * 24 * 60 * 60 * 1000));
        const monthTotal = await calculateMonthlyTotal(yesterday);
        const lastMonthTotal = await calculateMonthlyTotal(new Date(yesterday.getFullYear(), yesterday.getMonth() - 1, yesterday.getDate()));

        // 메시지 생성 - getTimeBasedMessage 함수 사용
        const timeBasedMessage = yesterdayRecords.length === 0 
            ? getTimeBasedMessage(0, false)  // 근무 기록이 없는 경우
            : getTimeBasedMessage(totalSeconds, true);  // 근무 기록이 있는 경우

        // EmailService 인스턴스 생성
        const emailService = new EmailService();

        // 이메일 발송
        await emailService.sendEmail({
            to_email: settings.email,
            date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
            weekday: weekdays[yesterday.getDay()],
            start_time: startTime,
            end_time: endTime,
            total_hours: (totalSeconds / 3600).toFixed(1),
            week_hours: (weekTotal / 3600).toFixed(1),
            last_week_hours: (lastWeekTotal / 3600).toFixed(1),
            month_hours: (monthTotal / 3600).toFixed(1),
            last_month_hours: (lastMonthTotal / 3600).toFixed(1),
            message: timeBasedMessage,
            has_notice: yesterdayRecords.length === 0,
            notices: [],
            week_status: `${weekdays[yesterday.getDay()]}일 기준`
        });

        console.log('이메일 발송 완료');
    } catch (error) {
        console.error('이메일 발송 실패:', error);
    }
  }
}

// 주간 합계 계산 함수
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

// 월간 합계 계산 함수
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

// Service Worker 초기화
const workManager = new WorkManager();

// Service Worker 이벤트 리스너
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
});

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