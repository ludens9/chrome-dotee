// StorageManager는 전역 객체로 사용 가능

// 상수 정의 추가
const Events = {
  STATUS_UPDATED: 'STATUS_UPDATED',
  TIMER_TICK: 'TIMER_TICK',
  WORK_COMPLETED: 'WORK_COMPLETED',
  DAY_CHANGED: 'DAY_CHANGED'
};

class PopupManager {
  constructor() {
    console.log('PopupManager 생성자 호출');
    this.initializeWhenReady();

    // 설정 관련 요소들
    this.emailInput = document.getElementById('email-input');
    this.periodSelect = document.getElementById('period-select');
    this.hourSelect = document.getElementById('hour-select');
    this.minuteSelect = document.getElementById('minute-select');
    this.saveSettingsBtn = document.getElementById('save-settings');

    // 설정 저장 버튼 이벤트 리스너
    this.saveSettingsBtn.addEventListener('click', () => this.handleSaveSettings());
    
    // 초기 설정값 로드
    this.loadSettings();

    this.updateInterval = null;
  }

  initializeWhenReady() {
    if (document.readyState === 'loading') {
      console.log('DOM 로딩 중... DOMContentLoaded 대기');
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      console.log('DOM 이미 로드됨. 즉시 초기화');
      this.init();
    }
  }

  async init() {
    console.log('PopupManager 초기화 시작');
    try {
      await this.initializeElements();
      await this.initializeListeners();
      await this.requestInitialState();
      console.log('PopupManager 초기화 완료');
    } catch (error) {
      console.error('PopupManager 초기화 실패:', error);
      this.showError('초기화 실패: ' + error.message);
    }
  }

  showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    errorContainer.style.color = 'red';
    
    // 3초 후 메시지 숨김
    setTimeout(() => {
      errorContainer.style.display = 'none';
    }, 3000);
  }

  showSuccess(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    errorContainer.style.color = 'green';
    
    // 3초 후 메시지 숨김
    setTimeout(() => {
      errorContainer.style.display = 'none';
    }, 3000);
  }

  async requestInitialState() {
    console.log('초기 상태 요청');
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      
      console.log('초기 상태 수신:', response);
      if (response) {
        this.updateDisplay(response);
      }
    } catch (error) {
      console.error('초기 상태 요청 실패:', error);
      throw error;
    }
  }

  initializeElements() {
    console.log('요소 초기화 시작');
    try {
      // null 체크 추가
      const elements = {
        workToggle: document.getElementById('work-toggle'),
        currentSessionEl: document.querySelector('.current-session'),
        dateDisplayEl: document.querySelector('.date-display'),
        totalTodayEl: document.querySelector('.total-today'),
        autoStopSelect: document.getElementById('auto-stop'),
        settingsBtn: document.getElementById('settings-btn'),
        backBtn: document.getElementById('back-btn'),
        mainPage: document.getElementById('main-page'),
        settingsPage: document.getElementById('settings-page')
      };

      // 모든 요소가 존재하는지 확인
      Object.entries(elements).forEach(([name, element]) => {
        if (!element) {
          throw new Error(`필수 요소를 찾을 수 없음: ${name}`);
        }
        this[name] = element;
      });

      console.log('요소 초기화 완료');
    } catch (error) {
      console.error('요소 초기화 실패:', error);
      throw error;
    }
  }

  initializeListeners() {
    console.log('리스너 초기화 시작');
    
    // 페이지 전환 리스너 추가
    this.settingsBtn?.addEventListener('click', () => {
      this.mainPage.classList.remove('active');
      this.settingsPage.classList.add('active');
    });

    this.backBtn?.addEventListener('click', () => {
      this.settingsPage.classList.remove('active');
      this.mainPage.classList.add('active');
    });

    // 작업 시작/종료 토글
    this.workToggle?.addEventListener('change', (event) => this.handleWorkToggle(event));

    // 자동 종료 시간 변경
    this.autoStopSelect?.addEventListener('change', (event) => {
      const hours = parseFloat(event.target.value);
      chrome.runtime.sendMessage({
        type: 'SET_AUTO_STOP',
        data: hours
      });
    });

    // 상태 업데이트 수신
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'STATUS_UPDATED') {
        this.updateDisplay(message.data);
      }
    });
    
    console.log('리스너 초기화 완료');
  }

  async updateDisplay() {
    try {
      // 날짜 표시 업데이트
      const now = new Date();
      const dateStr = this.formatDate(now);
      this.dateDisplayEl.textContent = `${dateStr} 누적근무시간`;

      // 먼저 오늘의 완료된 세션들의 누적 시간을 가져옴
      const stats = await StorageManager.getDailyStats(now);
      let totalDuration = stats.totalDuration;

      // 현재 세션 상태 확인
      const session = await StorageManager.getCurrentSession();
      this.workToggle.checked = !!session;
      this.autoStopSelect.disabled = !!session;
      
      if (session) {
        // 현재 세션 시간 계산
        const currentDuration = Math.floor((Date.now() - session.startTime) / 1000);
        this.currentSessionEl.textContent = this.formatTime(currentDuration);
        
        // 현재 진행 중인 세션 시간을 누적 시간에 더함
        totalDuration += currentDuration;

        // 자동 업데이트 시작
        if (!this.updateInterval) {
          this.startAutoUpdate();
        }
      } else {
        this.currentSessionEl.textContent = '00:00:00';
        this.stopAutoUpdate();
      }

      // 총 누적 시간 표시 (완료된 세션 + 현재 세션)
      const hoursWorked = (totalDuration / 3600).toFixed(1);
      this.totalTodayEl.textContent = `${hoursWorked}h`;

    } catch (error) {
      console.error('화면 업데이트 실패:', error);
    }
  }

  startAutoUpdate() {
    if (this.updateInterval) return;
    
    this.updateInterval = setInterval(async () => {
      const session = await StorageManager.getCurrentSession();
      if (session) {
        // 현재 세션 시간 계산
        const currentDuration = Math.floor((Date.now() - session.startTime) / 1000);
        this.currentSessionEl.textContent = this.formatTime(currentDuration);

        // 오늘의 총 누적 시간 계산 (완료된 세션 + 현재 진행중인 세션)
        const stats = await StorageManager.getDailyStats(new Date());
        const totalDuration = stats.totalDuration + currentDuration;  // 현재 세션 시간 추가
        const hoursWorked = (totalDuration / 3600).toFixed(1);
        this.totalTodayEl.textContent = `${hoursWorked}h`;
      }
    }, 1000);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  formatTime(seconds) {
    // 24시간 이상의 시간도 올바르게 표시
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    // 시간이 24를 넘어가면 경고 로그
    if (h >= 24) {
      console.warn('비정상적으로 긴 세션 감지:', {
        총시간: seconds,
        시: h,
        분: m,
        초: s
      });
    }
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatDate(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = days[date.getDay()];
    return `${month}월 ${day}일 (${dayOfWeek})`;
  }

  // 설정 저장 처리
  async handleSaveSettings() {
    try {
      const email = this.emailInput.value.trim();
      if (!email) {
        alert('이메일 주소를 입력해주세요.');
        return;
      }

      // 이메일 형식 검증
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert('올바른 이메일 주소를 입력해주세요.');
        return;
      }

      // 시간 설정 가져오기
      const period = this.periodSelect.value;
      const hour = parseInt(this.hourSelect.value);
      const minute = parseInt(this.minuteSelect.value);
      
      // 24시간 형식으로 변환
      const hour24 = period === 'PM' && hour !== 12 ? hour + 12 : (period === 'AM' && hour === 12 ? 0 : hour);
      const timeStr = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

      // 설정 저장
      await StorageManager.saveSettings({
        email,
        reportTime: timeStr,
        autoStopHours: null
      });

      // 이메일 알람 설정 요청
      await chrome.runtime.sendMessage({
        type: 'SETUP_EMAIL_ALARM',
        data: { reportTime: timeStr }
      });

      // 성공 메시지 표시 후 메인 페이지로 이동
      alert('설정이 저장되었습니다.');
      
      // alert 확인 후 메인 페이지로 이동
      this.settingsPage.classList.remove('active');
      this.mainPage.classList.add('active');
      
    } catch (error) {
      console.error('설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다: ' + error.message);
    }
  }

  // 저장된 설정 불러오기
  async loadSettings() {
    try {
      const settings = await StorageManager.getSettings();
      
      // 이메일 설정
      if (settings.email) {
        this.emailInput.value = settings.email;
      }

      // 시간 설정
      if (settings.reportTime) {
        const [hours, minutes] = settings.reportTime.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;

        this.periodSelect.value = period;
        this.hourSelect.value = String(hour12);
        this.minuteSelect.value = String(minutes);
      }
    } catch (error) {
      console.error('설정 로드 실패:', error);
      this.showError('설정을 불러오는데 실패했습니다.');
    }
  }

  async handleWorkToggle(event) {
    const isStarting = event.target.checked;
    
    // 즉각적인 UI 피드백
    this.workToggle.disabled = true;
    
    try {
      if (isStarting) {
        await chrome.runtime.sendMessage({ 
          type: 'START_WORK',
          data: { autoStopHours: parseInt(this.autoStopSelect.value) }
        });
        this.startAutoUpdate();
        // 근무 시작 시 자동종료 옵션 비활성화
        this.autoStopSelect.disabled = true;
      } else {
        await chrome.runtime.sendMessage({ type: 'STOP_WORK' });
        this.stopAutoUpdate();
        this.currentSessionEl.textContent = '00:00:00';
        // 근무 종료 시 자동종료 옵션 활성화
        this.autoStopSelect.disabled = false;
      }
    } catch (error) {
      console.error('작업 토글 실패:', error);
      // 실패 시 토글 상태 되돌리기
      this.workToggle.checked = !isStarting;
    } finally {
      this.workToggle.disabled = false;
    }
  }
}

// 전역 인스턴스 생성
let popupManager = null;

// 초기화 함수
function initializePopup() {
  try {
    console.log('팝업 초기화 시작');
    if (!popupManager) {
      popupManager = new PopupManager();
    }
  } catch (error) {
    console.error('팝업 초기화 실패:', error);
  }
}

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
} 