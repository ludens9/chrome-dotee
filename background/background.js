// ES 모듈 import 제거
importScripts(
  '../js/messageUtil.js',  // messageUtil을 먼저 로드
  '../js/storage.js',
  '../js/email.js',
  '../js/midnight.js'  // MidnightManager 클래스가 포함된 파일
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
    this.setupKeepAlive();
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
        // 메시지 처리를 Promise로 래핑
        const handleMessage = async () => {
            try {
                switch (message.type) {
                    case Commands.START_WORK:
                        await this.startWork(message.data);
                        return { success: true };
                    case Commands.STOP_WORK:
                        await this.stopWork();
                        return { success: true };
                    case Commands.GET_STATUS:
                        return this.state;
                    case Commands.SET_AUTO_STOP:
                        await this.setAutoStop(message.data);
                        return { success: true };
                    case 'SETUP_EMAIL_ALARM':
                        await this.setupEmailAlarm();
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
                        await this.handleMidnightReset();
                        return { success: true };
                }
            } catch (error) {
                console.error('Message handling error:', error);
                return { success: false, error: error.message };
            }
        };

        // Promise 처리 및 응답 전송
        handleMessage().then(response => {
            sendResponse(response);
        });

        return true;  // 비동기 응답을 위해 반드시 필요
    });
  }

  startTimer() {
    if (this.timer) return;
    
    // 디버깅을 위한 초기 상태 로그
    console.log('타이머 시작 시 상태:', {
        savedTotalToday: this.state.savedTotalToday,
        totalToday: this.state.totalToday,
        startTime: this.state.startTime
    });
    
    this.timer = setInterval(async () => {
        if (!this.state.startTime) return;
        
        const now = new Date();
        // 현재 세션 시간 계산 (초 단위)
        const sessionSeconds = Math.floor((now - new Date(this.state.startTime)) / 1000);
        
        // savedTotalToday가 undefined나 null이 되지 않도록 보호
        const savedSeconds = this.state.savedTotalToday || 0;
        
        // 누적 시간 계산 (이전 누적 + 현재 세션)
        this.state.currentSession = sessionSeconds;
        this.state.totalToday = savedSeconds + sessionSeconds;
        
        // 디버깅을 위한 상세 로그
        console.log('Timer Update:', {
            currentSession: this.formatTime(sessionSeconds),
            savedTotal: this.formatTime(savedSeconds),
            totalToday: this.formatTime(this.state.totalToday),
            raw: {
                savedSeconds,
                sessionSeconds,
                total: this.state.totalToday
            }
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
    try {
        // 현재 시간을 정확하게 가져옴
        const now = new Date();
        
        // 기존 상태에서 totalToday 값을 보존
        const currentTotal = this.state.totalToday || 0;
        
        this.state = {
            ...this.state,
            isWorking: true,
            startTime: now.toISOString(),
            currentSession: 0,
            savedTotalToday: currentTotal,  // 현재까지의 누적시간 보존
            totalToday: currentTotal,       // 현재까지의 누적시간 보존
            autoStopHours: data.autoStopHours !== null ? data.autoStopHours : (this.state.autoStopHours || 0)
        };
        
        console.log('근무 시작:', {
            시작시간: now.toLocaleString(),
            누적시간: currentTotal,
            상태: this.state
        });
        
        this.startTimer();
        this.iconAnimator.startAnimation();
        await this.saveAndNotify();
        
        if (this.state.autoStopHours > 0) {
            this.setupAutoStop();
        }
    } catch (error) {
        console.error('근무 시작 실패:', error);
    }
  }

  async stopWork() {
    try {
      if (!this.state.isWorking || !this.state.startTime) return;

      const now = new Date();
      const startTime = new Date(this.state.startTime);
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);

      // 시작 시간이 전날인 경우
      if (startTime < midnight) {
        // 자정까지의 세션 저장
        const previousDate = new Date(midnight);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateStr = previousDate.toISOString().split('T')[0];
        
        const previousSession = {
          date: previousDateStr,
          duration: Math.floor((midnight - startTime) / 1000),
          startTime: this.state.startTime,
          endTime: midnight.toISOString()
        };
        
        await StorageManager.saveWorkRecord(previousSession);

        // 자정부터 현재까지의 세션 저장
        const currentSession = {
          date: now.toISOString().split('T')[0],
          duration: Math.floor((now - midnight) / 1000),
          startTime: midnight.toISOString(),
          endTime: now.toISOString()
        };
        
        await StorageManager.saveWorkRecord(currentSession);
      } else {
        // 같은 날짜 내의 세션
        const session = {
          date: now.toISOString().split('T')[0],
          duration: Math.floor((now - startTime) / 1000),
          startTime: this.state.startTime,
          endTime: now.toISOString()
        };
        
        await StorageManager.saveWorkRecord(session);
      }

      // 상태 초기화 전 현재 누적시간 저장
      const finalTotal = this.state.totalToday;

      // 상태 초기화
      this.state = {
        isWorking: false,
        startTime: null,
        currentSession: 0,
        totalToday: finalTotal,      // 누적시간 유지
        savedTotalToday: finalTotal, // 누적시간을 savedTotalToday에도 유지
        autoStopHours: this.state.autoStopHours
      };

      this.stopTimer();
      this.iconAnimator.resetToDefault();
      await this.saveAndNotify();
    } catch (error) {
      console.error('근무 종료 실패:', error);
    }
  }

  async saveAndNotify() {
    try {
        // 저장 전 상태 확인
        console.log('저장 전 상태:', {
            ...this.state,
            currentSession: this.formatTime(this.state.currentSession),
            savedTotal: this.formatTime(this.state.savedTotalToday),
            totalToday: this.formatTime(this.state.totalToday)
        });
        
        await StorageManager.saveWorkStatus(this.state);
        
        // 저장 후 상태 확인
        const savedState = await StorageManager.getWorkStatus();
        console.log('저장 후 상태:', {
            ...savedState,
            currentSession: this.formatTime(savedState.currentSession),
            savedTotal: this.formatTime(savedState.savedTotalToday),
            totalToday: this.formatTime(savedState.totalToday)
        });
        
        chrome.runtime.sendMessage({
            type: Events.STATUS_UPDATED,
            data: this.state
        }).catch(() => {
            // 팝업이 닫혀있을 때는 무시
            console.log('Popup might be closed, ignoring message send');
        });
    } catch (error) {
        console.error('상태 저장 실패:', error);
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
                await this.sendDailyReport();
            }
        } catch (error) {
            console.error('Alarm handling error:', error);
            // 에러 상황에 대한 적절한 처리 추가
        }
    });
  }

  async handleMidnightReset() {
    if (!this.state.isWorking || !this.state.startTime) return;

    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);

    try {
        // 1. 현재 상태 백업
        const currentState = { ...this.state };

        // 2. 이전 날짜의 세션 저장
        const startTime = new Date(this.state.startTime);
        if (startTime < midnight) {
            const previousDate = new Date(midnight);
            previousDate.setDate(previousDate.getDate() - 1);
            const dateStr = previousDate.toISOString().split('T')[0];
            
            const previousDaySession = Math.floor((midnight - startTime) / 1000);
            const previousRecord = {
                date: dateStr,
                duration: previousDaySession,
                startTime: this.state.startTime,
                endTime: midnight.toISOString()
            };
            
            await StorageManager.saveWorkRecord(previousRecord);
        }

        // 3. 새로운 날짜의 세션 시작
        this.state = {
            isWorking: true,
            startTime: midnight.toISOString(),
            currentSession: Math.floor((now - midnight) / 1000),
            totalToday: Math.floor((now - midnight) / 1000),
            savedTotalToday: 0,
            autoStopHours: this.state.autoStopHours
        };

        // 4. 새로운 상태 저장 및 검증
        await this.saveAndNotify();
        
        // 5. 상태 검증
        const savedStatus = await StorageManager.getWorkStatus();
        if (!savedStatus || !savedStatus.startTime || new Date(savedStatus.startTime) < midnight) {
            // 검증 실패 시 이전 상태로 복원
            this.state = currentState;
            await this.saveAndNotify();
            throw new Error('Midnight reset verification failed');
        }

    } catch (error) {
        console.error('자정 리셋 실패:', error);
        throw error;
    }
  }

  async sendDailyReport() {
    try {
      const settings = await chrome.storage.local.get(['email', 'reportTime']);
      if (!settings.email) {
        console.log('이메일 설정이 없습니다.');
        return;
      }

      // 새 탭을 생성하고 완료될 때까지 대기
      const tab = await chrome.tabs.create({
        url: chrome.runtime.getURL('email/send.html'),
        active: false
      });

      // 탭이 로드될 때까지 대기
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.remove(tab.id);
          reject(new Error('이메일 발송 시간 초과'));
        }, 30000); // 30초 타임아웃

        chrome.tabs.onRemoved.addListener(function listener(tabId) {
          if (tabId === tab.id) {
            chrome.tabs.onRemoved.removeListener(listener);
            clearTimeout(timeout);
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('이메일 발송 실패:', error);
      throw error;
    }
  }

  setupKeepAlive() {
    // 5분마다 keepalive 신호 보내기
    setInterval(() => {
      if (this.state.isWorking) {
        chrome.runtime.getPlatformInfo(() => {});
      }
    }, 5 * 60 * 1000);
  }

  async setupMidnightReset() {
    // Implementation needed
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
  // 활성화 시 알람 재설정
  event.waitUntil(workManager.setupEmailAlarm());
});

self.addEventListener('unload', () => {
  if (workManager.midnightManager) {
    workManager.midnightManager.destroy();
  }
}); 