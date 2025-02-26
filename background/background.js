// 의존성 순서대로 import
importScripts(
  '../js/storage.js',      // 기본 스토리지
  '../js/messageUtil.js',  // 메시지 유틸
  '../js/midnight.js',     // 자정 처리 관리자
  '../js/email.js'        // 이메일 서비스 (weekdays 포함)
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

// DefaultState 정의 확인
const DefaultState = {
  isWorking: false,
  startTime: null,
  currentSession: 0,
  totalToday: 0,
  savedTotalToday: 0,
  autoStopHours: 0
};

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
    this.iconAnimator = new IconAnimator();
    this.setupMidnightCheck();
    this.setupTimerCheck();
  }

  setupMidnightCheck() {
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        await StorageManager.handleMidnight();
      }
    }, 1000 * 60); // 매분 체크
  }

  setupTimerCheck() {
    setInterval(async () => {
      const session = await StorageManager.getCurrentSession();
      if (session) {
        const now = Date.now();
        const duration = Math.floor((now - session.startTime) / 1000);
        await this.updateBadge(duration);
      }
    }, 1000);
  }

  async updateBadge(seconds) {
    try {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const text = `${hours}:${String(minutes).padStart(2, '0')}`;
      
      // 배지 배경색 설정 (반투명 회색)
      await chrome.action.setBadgeBackgroundColor({ 
        color: [102, 102, 102, 180]  // RGBA 형식, 마지막 값은 투명도 (0-255)
      });
      
      // 배지 텍스트 설정
      await chrome.action.setBadgeText({ text });
    } catch (error) {
      console.error('배지 업데이트 실패:', error);
    }
  }

  async startWork() {
    const session = await StorageManager.startSession();
    this.iconAnimator.startAnimation();
    return session;
  }

  async stopWork() {
    try {
      const session = await StorageManager.getCurrentSession();
      if (!session) return null;

      const nextSession = session.end(Date.now());
      await StorageManager.saveWorkRecord(session);

      if (nextSession) {
        await StorageManager.saveWorkRecord(nextSession);
      }

      await StorageManager.clearCurrentSession();
      this.iconAnimator.resetToDefault();
      await chrome.action.setBadgeText({ text: '' });

      return session;
    } catch (error) {
      console.error('작업 중지 실패:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      const now = new Date();
      const today = now.toDateString();
      const saved = await StorageManager.getWorkStatus();
      if (saved) {
        this.state = { ...DefaultState, ...saved };
        if (this.state.isWorking) {
          this.startTimer();
          this.iconAnimator.startAnimation();
        } else {
          this.iconAnimator.resetToDefault();
        }
      }
      
      await this.saveAndNotify();
      
      console.log('WorkManager 초기화 완료:', this.state);
    } catch (error) {
      console.error('WorkManager 초기화 실패:', error);
      throw error;
    }
  }

  async setupMidnightReset() {
    // 다음 자정까지의 시간 계산
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow - now;
    
    // 자정 알람 설정
    await chrome.alarms.create('midnight', {
      when: Date.now() + msUntilMidnight,
      periodInMinutes: 24 * 60 // 24시간마다 반복
    });
  }

  startTimer() {
    if (this.timer) return;
    
    this.timer = setInterval(async () => {
      if (!this.state.startTime) return;
      
      const now = new Date();
      const startTime = new Date(this.state.startTime);
      
      // 자정을 지난 경우와 아닌 경우를 구분
      if (now.getDate() !== startTime.getDate()) {
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);
        // 현재 세션은 자정부터 시작
        this.state.currentSession = Math.floor((now - midnight) / 1000);
        this.state.totalToday = this.state.currentSession;
      } else {
        // 같은 날짜 내에서는 시작 시간부터 계산
        this.state.currentSession = Math.floor((now - startTime) / 1000);
        this.state.totalToday = this.state.savedTotalToday + this.state.currentSession;
      }
      
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

  async saveAndNotify() {
    await StorageManager.saveWorkStatus(this.state);
    try {
        await chrome.runtime.sendMessage({
            type: Events.STATUS_UPDATED,
            data: this.state
        });
    } catch (error) {
        console.log('팝업이 닫혀있어 알림을 보내지 못했습니다');
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
      await chrome.alarms.clear('dailyReport');
      
      const settings = await StorageManager.getSettings();
      if (!settings.email || !settings.reportTime) {
        console.log('이메일 알람 설정 실패: 설정 없음');
        return;
      }

      // 다음 발송 시간 계산
      const [hours, minutes] = settings.reportTime.split(':').map(Number);
      const now = new Date();
      const nextReport = new Date(now);
      nextReport.setHours(hours, minutes, 0, 0);
      
      if (nextReport <= now) {
        nextReport.setDate(nextReport.getDate() + 1);
      }

      // 알람 생성
      await chrome.alarms.create('dailyReport', {
        when: nextReport.getTime(),
        periodInMinutes: 24 * 60
      });

      console.log('이메일 알람 설정됨:', {
        다음발송: nextReport.toLocaleString(),
        시간: settings.reportTime
      });
    } catch (error) {
      console.error('이메일 알람 설정 실패:', error);
    }
  }

  async handleMidnightReset() {
    try {
      const session = await StorageManager.getCurrentSession();
      if (!session) return;

      // 자정 시간 계산
      const midnight = new Date();
      midnight.setHours(23, 59, 59, 999);  // 23:59:59.999로 설정

      // 현재 세션 종료
      session.end(midnight.getTime());
      await StorageManager.saveWorkRecord(session);
      
      // 새로운 날의 세션 시작
      const nextDay = new Date();
      nextDay.setHours(0, 0, 0, 0);
      const newSession = new WorkSession(nextDay.getTime());
      await StorageManager.saveCurrentSession(newSession);

      console.log('자정 처리 완료:', {
        종료된세션: session,
        새세션: newSession
      });
    } catch (error) {
      console.error('자정 처리 실패:', error);
    }
  }

  async sendDailyReport() {
    try {
      await EmailService.sendDailyReport();
      console.log('일일 리포트 발송 완료');
      return true;
    } catch (error) {
      console.error('일일 리포트 발송 실패:', error);
      throw error;
    }
  }

  async debugDailyReport() {
    try {
      await EmailService.sendDailyReport();
      console.log('테스트 리포트 발송 완료');
    } catch (error) {
      console.error('테스트 리포트 발송 실패:', error);
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
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

// 전역 인스턴스 생성
let workManager = null;

// Service Worker 초기화
chrome.runtime.onInstalled.addListener(async () => {
  console.log('확장프로그램 설치/업데이트됨');
  if (!workManager) {
    workManager = new WorkManager();
    await workManager.initialize();
  }
});

// 메시지 리스너 설정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('메시지 수신:', message);
  
  const handleMessage = async () => {
    try {
      // workManager가 없으면 초기화
      if (!workManager) {
        console.log('WorkManager 초기화 중...');
        workManager = new WorkManager();
        await workManager.initialize();
      }

      switch (message.type) {
        case 'GET_STATUS':
          console.log('상태 요청 처리');
          return workManager.state;
        case 'START_WORK':
          console.log('작업 시작 요청');
          await workManager.startWork();
          return { success: true };
        case 'STOP_WORK':
          console.log('작업 중지 요청');
          await workManager.stopWork();
          return { success: true };
        case 'SET_AUTO_STOP':
          console.log('자동 중지 설정');
          await workManager.setAutoStop(message.data);
          return { success: true };
        case 'SETUP_EMAIL_ALARM':
          await workManager.setupEmailAlarm();
          return { success: true };
        case 'TEST_EMAIL_REPORT':
          try {
            await chrome.tabs.create({
              url: chrome.runtime.getURL('email/send.html')
            });
            console.log('이메일 발송 페이지 열림');
            return { success: true };
          } catch (error) {
            console.error('이메일 발송 테스트 실패:', error);
            return { success: false, error: error.message };
          }
        case 'MIDNIGHT_RESET_TEST':
          await workManager.handleMidnightReset();
          return { success: true };
        case 'SEND_DAILY_REPORT':
          await workManager.sendDailyReport()
            .then(() => sendResponse(true))
            .catch(error => {
              console.error('일일 리포트 발송 실패:', error);
              sendResponse(false);
            });
          return true;
        default:
          console.log('알 수 없는 메시지 타입:', message.type);
          return { success: false, error: '알 수 없는 메시지 타입' };
      }
    } catch (error) {
      console.error('메시지 처리 실패:', error);
      return { success: false, error: error.message };
    }
  };

  // 비동기 응답 처리
  handleMessage().then(sendResponse);
  return true;  // 비동기 응답을 위해 true 반환
});

// 알람 리스너 설정
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReport') {
    try {
      const settings = await StorageManager.getSettings();
      if (!settings.email) return;

      await chrome.tabs.create({
        url: chrome.runtime.getURL('email/send.html')
      });
    } catch (error) {
      console.error('알람 처리 실패:', error);
    }
  }
});

async function checkMidnight() {
    const currentState = await StorageManager.getWorkStatus();
    if (currentState.isWorking) {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            const prevWorkEnd = new Date(now);
            prevWorkEnd.setSeconds(0);
            prevWorkEnd.setMilliseconds(0);
            
            await StorageManager.saveWorkRecord({
                startTime: currentState.startTime,
                endTime: prevWorkEnd.getTime(),
                duration: Math.floor((prevWorkEnd.getTime() - currentState.startTime) / 1000)
            });

            const newStartTime = new Date(now);
            newStartTime.setSeconds(0);
            newStartTime.setMilliseconds(0);
            
            await StorageManager.saveWorkStatus({
                ...currentState,
                startTime: newStartTime.getTime()
            });
        }
    }
}

// 자정 체크를 위한 인터벌 추가
setInterval(checkMidnight, 1000 * 60); // 1분마다 체크 