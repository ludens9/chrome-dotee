// 필요한 스크립트들을 순서대로 로드
self.importScripts(
  '../js/storage.js',
  '../js/email.js',
  '../js/messageUtil.js',
  '../js/midnight.js'
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
  autoStopHours: 2
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
    this.midnightManager = new MidnightManager(this);
  }

  async initialize() {
    try {
      const now = new Date();
      const today = now.toDateString();
      const saved = await StorageManager.getWorkStatus();
      
      // 상태 초기화
      this.state = saved;
      
      // 작업 중이면 타이머 시작
      if (this.state.isWorking && this.state.startTime) {
        // 시작 시간 유효성 검사
        const now = new Date();
        const startTime = new Date(this.state.startTime);
        
        if (startTime > now || startTime.toDateString() !== now.toDateString()) {
          // 유효하지 않은 시작 시간이면 작업 중지
          this.state = {
            ...this.state,
            isWorking: false,
            startTime: null,
            currentSession: 0,
            totalToday: 0,
            savedTotalToday: 0
          };
          await this.saveAndNotify();
        } else {
          this.startTimer();
          this.iconAnimator.startAnimation();
        }
      } else {
        this.iconAnimator.resetToDefault();
      }
      
      await this.saveAndNotify();
      
      console.log('WorkManager 초기화 완료:', {
        현재시간: new Date().toLocaleString(),
        상태: this.state
      });
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
    try {
        const now = new Date();  // 로컬 시간
        
        this.state = {
            ...this.state,
            isWorking: true,
            startTime: now.getTime(),  // timestamp로 저장
            currentSession: 0,
            savedTotalToday: savedTotalToday,
            totalToday: savedTotalToday,  // 초기 totalToday는 savedTotalToday와 동일
            autoStopHours: data.autoStopHours !== null ? data.autoStopHours : (this.state.autoStopHours || 0)
        };
        
        console.log('근무 시작:', {
            시작시간: now.toLocaleString(),
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
        const endTime = now.getTime();  // timestamp로 저장
        const sessionDuration = Math.floor((endTime - this.state.startTime) / 1000);  // 초 단위로 계산
        
        console.log('근무 종료:', {
            시작: new Date(this.state.startTime).toLocaleString(),
            종료: now.toLocaleString(),
            시간: sessionDuration
        });
        
        // 세션 기록 저장
        const record = {
            startTime: this.state.startTime,
            endTime: endTime,
            duration: sessionDuration
        };
        
        await StorageManager.saveWorkRecord(record);
        
        // 상태 초기화
        this.state = {
            ...DefaultState,
            totalToday: this.state.totalToday,
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

  async handleMidnightReset() {
    try {
        console.log('자정 리셋 시작:', {
            현재상태: this.state,
            현재시간: new Date().toISOString()
        });

        if (!this.state.isWorking) return;

        const now = new Date();
        const startTime = new Date(this.state.startTime);
        
        // 현재 시간이 자정인지, 그리고 시작 시간이 이전 날짜인지 확인
        if (now.getHours() === 0 && now.getMinutes() === 0 && 
            startTime.getDate() !== now.getDate()) {
            
            console.log('자정 세션 분할 시작:', {
                현재시간: now.toLocaleString(),
                시작시간: startTime.toLocaleString()
            });

            // 자정 시간 계산
            const midnight = new Date(now);
            midnight.setHours(0, 0, 0, 0);

            // 1. 이전 날짜의 세션 저장 (시작시간 ~ 자정)
            const prevDayDuration = Math.floor((midnight - startTime) / 1000);
            const prevDayRecord = {
                startTime: startTime.getTime(),
                endTime: midnight.getTime(),
                duration: prevDayDuration
            };

            await StorageManager.saveWorkRecord(prevDayRecord);
            console.log('이전 날짜 세션 저장:', prevDayRecord);

            // 2. 새로운 날짜의 세션 시작 (자정 ~ 현재)
            const newState = {
                ...this.state,
                startTime: midnight.getTime(),
                currentSession: Math.floor((now - midnight) / 1000),
                totalToday: Math.floor((now - midnight) / 1000),
                savedTotalToday: 0
            };

            await StorageManager.saveWorkStatus(newState);
            console.log('새 날짜 세션 시작:', newState);

            // 상태 업데이트 알림
            chrome.runtime.sendMessage({
                type: Events.STATUS_UPDATED,
                data: newState
            }).catch(err => console.log('Popup might be closed'));
        }
    } catch (error) {
        console.error('자정 처리 중 오류 발생:', error);
    }
  }

  async sendDailyReport() {
    try {
      const settings = await chrome.storage.local.get(['email', 'reportTime']);
      if (!settings.email) {
        console.log('이메일 설정이 없음');
        return;
      }

      // 어제 날짜 계산
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // 상세 로깅 추가
      console.group('일일 리포트 생성 과정');
      console.log('1. 날짜 정보:', {
        어제날짜: yesterdayStr,
        날짜객체: yesterday
      });

      // 어제의 근무 기록 가져오기
      const yesterdayRecords = await StorageManager.getWorkRecords(yesterdayStr);
      console.log('2. 근무 기록 조회:', {
        조회키: `workRecords_${yesterdayStr}`,
        기록: yesterdayRecords,
        기록수: yesterdayRecords?.length || 0
      });

      // 기본값 설정
      let emailData = {
        to_email: settings.email,
        date: `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`,
        month: yesterday.getMonth() + 1,
        last_month: yesterday.getMonth() || 12,
        weekday: weekdays[yesterday.getDay()],
        start_time: '기록 없음',
        end_time: '기록 없음',
        total_hours: '0.0',
        total_sessions: 0,
        week_hours: '0.0',
        last_week_hours: '0.0',
        month_hours: '0.0',
        last_month_hours: '0.0',
        message: getTimeBasedMessage(0, false),
        has_record: false
      };

      // 근무 기록이 있는 경우 데이터 업데이트
      if (yesterdayRecords && yesterdayRecords.length > 0) {
        console.log('3. 근무 기록 처리:', {
          첫기록: yesterdayRecords[0],
          마지막기록: yesterdayRecords[yesterdayRecords.length - 1]
        });

        const totalSeconds = yesterdayRecords.reduce((total, record) => total + record.duration, 0);
        
        emailData = {
          ...emailData,
          start_time: new Date(yesterdayRecords[0].startTime).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          end_time: new Date(yesterdayRecords[yesterdayRecords.length - 1].endTime).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          total_hours: (totalSeconds / 3600).toFixed(1),
          total_sessions: yesterdayRecords.length,
          message: getTimeBasedMessage(totalSeconds, true),
          has_record: true
        };
      }

      // 주간/월간 통계 추가
      const weekTotal = await StorageManager.getWeeklyTotal(yesterday);
      const lastWeekTotal = await StorageManager.getLastWeekTotal(yesterday);
      const monthTotal = await StorageManager.getMonthlyTotal(yesterday);
      const lastMonthTotal = await StorageManager.getLastMonthTotal(yesterday);

      console.log('4. 통계 정보:', {
        주간: weekTotal / 3600,
        지난주: lastWeekTotal / 3600,
        월간: monthTotal / 3600,
        지난달: lastMonthTotal / 3600
      });

      emailData = {
        ...emailData,
        week_hours: (weekTotal / 3600).toFixed(1),
        last_week_hours: (lastWeekTotal / 3600).toFixed(1),
        month_hours: (monthTotal / 3600).toFixed(1),
        last_month_hours: (lastMonthTotal / 3600).toFixed(1)
      };

      console.log('5. 최종 이메일 데이터:', emailData);
      console.groupEnd();

      // 이메일 발송
      const emailService = new EmailService();
      await emailService.sendEmail(emailData);

      console.log('일일 리포트 발송 완료');
    } catch (error) {
      console.error('일일 리포트 발송 실패:', error);
    }
  }

  async debugDailyReport() {
    try {
      console.group('일일 리포트 디버그');
      
      // 설정 확인
      const settings = await chrome.storage.local.get(['email', 'reportTime']);
      console.log('이메일 설정:', settings);

      // 어제 날짜 계산
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      console.log('대상 날짜:', yesterdayStr);

      // 근무 기록 조회
      const records = await StorageManager.getWorkRecords(yesterdayStr);
      console.log('근무 기록:', {
        날짜: yesterdayStr,
        기록수: records?.length || 0,
        상세: records
      });

      // 통계 계산
      const weekTotal = await StorageManager.getWeeklyTotal(yesterday);
      const monthTotal = await StorageManager.getMonthlyTotal(yesterday);
      console.log('통계:', {
        주간: weekTotal / 3600,
        월간: monthTotal / 3600
      });

      console.groupEnd();
    } catch (error) {
      console.error('디버그 실패:', error);
    }
  }

  destroy() {
    this.midnightManager.destroy();
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

// Service Worker 초기화
let workManager;

// Service Worker 이벤트 리스너
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.resolve()
      .then(() => {
        console.log('Service Worker 설치 완료');
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.resolve()
      .then(async () => {
        console.log('Service Worker 활성화 시작');
        workManager = new WorkManager();
        await workManager.initialize();
        console.log('Service Worker 활성화 완료');
      })
  );
});

// 메시지 리스너 수정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 비동기 작업을 위한 async 함수
  (async () => {
    try {
      if (!workManager) {
        workManager = new WorkManager();
        await workManager.initialize();
      }

      let response;
      switch (message.type) {
        case Commands.START_WORK:
          await workManager.startWork(message.data);
          response = { success: true };
          break;
        case Commands.STOP_WORK:
          await workManager.stopWork();
          response = { success: true };
          break;
        case Commands.GET_STATUS:
          response = workManager.state;
          break;
        case Commands.SET_AUTO_STOP:
          await workManager.setAutoStop(message.data);
          response = { success: true };
          break;
        case 'SETUP_EMAIL_ALARM':
          await workManager.setupEmailAlarm();
          response = { success: true };
          break;
        case 'TEST_EMAIL_REPORT':
          try {
            await chrome.tabs.create({
              url: chrome.runtime.getURL('email/send.html')
            });
            response = { success: true };
          } catch (error) {
            console.error('이메일 발송 테스트 실패:', error);
            response = { success: false, error: error.message };
          }
          break;
        case 'MIDNIGHT_RESET_TEST':
          await workManager.handleMidnightReset();
          response = { success: true };
          break;
        default:
          response = { success: false, error: 'Unknown command' };
      }

      // 응답 전송
      sendResponse(response);
    } catch (error) {
      console.error('메시지 처리 실패:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  // 비동기 응답을 위해 반드시 true 반환
  return true;
});

// 알람 리스너 설정
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (!workManager) {
      workManager = new WorkManager();
      await workManager.initialize();
    }

    switch (alarm.name) {
      case 'midnight':
        await workManager.handleMidnightReset();
        break;
      case 'autoStop':
        await workManager.handleAutoStop();
        break;
      case 'emailReport':
        await workManager.sendDailyReport();
        break;
    }
  } catch (error) {
    console.error('알람 처리 실패:', error);
  }
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

async function checkMidnight() {
    try {
        const currentState = await StorageManager.getWorkStatus();
        if (!currentState?.isWorking) return;

        const now = new Date();
        const startTime = new Date(currentState.startTime);
        
        // 현재 시간이 자정인지, 그리고 시작 시간이 이전 날짜인지 확인
        if (now.getHours() === 0 && now.getMinutes() === 0 && 
            startTime.getDate() !== now.getDate()) {
            
            console.log('자정 세션 분할 시작:', {
                현재시간: now.toLocaleString(),
                시작시간: startTime.toLocaleString()
            });

            // 자정 시간 계산
            const midnight = new Date(now);
            midnight.setHours(0, 0, 0, 0);

            // 1. 이전 날짜의 세션 저장 (시작시간 ~ 자정)
            const prevDayDuration = Math.floor((midnight - startTime) / 1000);
            const prevDayRecord = {
                startTime: startTime.getTime(),
                endTime: midnight.getTime(),
                duration: prevDayDuration
            };

            await StorageManager.saveWorkRecord(prevDayRecord);
            console.log('이전 날짜 세션 저장:', prevDayRecord);

            // 2. 새로운 날짜의 세션 시작 (자정 ~ 현재)
            const newState = {
                ...currentState,
                startTime: midnight.getTime(),
                currentSession: Math.floor((now - midnight) / 1000),
                totalToday: Math.floor((now - midnight) / 1000),
                savedTotalToday: 0
            };

            await StorageManager.saveWorkStatus(newState);
            console.log('새 날짜 세션 시작:', newState);

            // 상태 업데이트 알림
            chrome.runtime.sendMessage({
                type: Events.STATUS_UPDATED,
                data: newState
            }).catch(err => console.log('Popup might be closed'));
        }
    } catch (error) {
        console.error('자정 처리 중 오류 발생:', error);
    }
}

// 자정 체크를 위한 인터벌 추가
setInterval(checkMidnight, 1000 * 30); // 30초마다 체크 