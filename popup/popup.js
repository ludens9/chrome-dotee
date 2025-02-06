// 상수 정의 추가
const Events = {
  STATUS_UPDATED: 'STATUS_UPDATED',
  TIMER_TICK: 'TIMER_TICK',
  WORK_COMPLETED: 'WORK_COMPLETED',
  DAY_CHANGED: 'DAY_CHANGED'
};

class PopupManager {
  constructor() {
    console.log('PopupManager 초기화 시작');
    this.initializeElements();
    this.initializeListeners();
    this.requestInitialState();
    console.log('PopupManager 초기화 완료');
  }

  initializeElements() {
    console.log('요소 초기화 시작');
    this.workToggle = document.getElementById('work-toggle');
    this.currentSessionEl = document.querySelector('.current-session');
    this.dateDisplayEl = document.querySelector('.date-display');
    this.totalTodayEl = document.querySelector('.total-today');
    this.autoStopSelect = document.getElementById('auto-stop');
    console.log('요소 초기화 완료');
  }

  initializeListeners() {
    console.log('리스너 초기화 시작');
    // 작업 시작/종료 토글
    this.workToggle.addEventListener('change', (event) => {
      const command = event.target.checked ? 'START_WORK' : 'STOP_WORK';
      chrome.runtime.sendMessage({
        type: command,
        data: { autoStopHours: null }
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

  async requestInitialState() {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GET_STATUS'
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      
      if (response) {
        this.updateDisplay(response);
      }
    } catch (error) {
      console.error('초기 상태 요청 실패:', error);
    }
  }

  updateDisplay(state) {
    if (!state) return;
    console.log('화면 업데이트:', state);

    this.workToggle.checked = state.isWorking;
    this.currentSessionEl.textContent = this.formatTime(state.currentSession || 0);
    this.dateDisplayEl.textContent = `${this.formatDate(new Date())} 총누적시간`;
    this.totalTodayEl.textContent = `${((state.totalToday || 0) / 3600).toFixed(1)}시간`;
  }

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatDate(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getMonth() + 1}.${date.getDate()}(${days[date.getDay()]})`;
  }
}

// 팝업 초기화
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 로드됨');
  new PopupManager();
}); 