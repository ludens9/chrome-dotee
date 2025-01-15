class WorkTimer {
  constructor() {
    this.currentSession = 0;
    this.totalToday = 0;
    this.isWorking = false;
    this.timer = null;
    this.sessionStart = null;
    this.listeners = new Set();
  }

  // 상태 변경 이벤트 리스너
  addStateListener(callback) {
    this.listeners.add(callback);
  }

  removeStateListener(callback) {
    this.listeners.delete(callback);
  }

  // 상태 변경 알림
  notifyStateChange() {
    const state = {
      isWorking: this.isWorking,
      currentSession: this.currentSession,
      totalToday: this.totalToday,
      sessionStart: this.sessionStart
    };
    
    this.listeners.forEach(callback => callback(state));
  }

  // 초기화 (비동기)
  async initialize() {
    const status = await StorageManager.getWorkStatus();
    if (status.isWorking) {
      this.isWorking = true;
      this.sessionStart = new Date(status.startTime);
      this.currentSession = status.currentSession;
      this.totalToday = status.totalToday;
      await this.startWork(true); // true = 복원 모드
    }
    this.notifyStateChange();
    return this;
  }

  async startWork(isRestore = false) {
    if (this.isWorking) return;
    
    this.isWorking = true;
    this.sessionStart = isRestore ? this.sessionStart : new Date();
    
    if (!isRestore) {
      await StorageManager.saveWorkStatus({
        isWorking: true,
        startTime: this.sessionStart.toISOString(),
        currentSession: this.currentSession,
        totalToday: this.totalToday
      });
    }

    this.timer = setInterval(async () => {
      this.currentSession = Math.floor((new Date() - this.sessionStart) / 1000);
      await StorageManager.updateCurrentSession(this.currentSession);
      this.updateDisplay();
      this.notifyStateChange();
    }, 1000);
  }

  async stopWork() {
    if (!this.isWorking) return;
    
    clearInterval(this.timer);
    this.isWorking = false;
    
    const sessionDuration = Math.floor((new Date() - this.sessionStart) / 1000);
    this.totalToday += sessionDuration;
    this.currentSession = 0;
    
    await StorageManager.saveWorkStatus({
      isWorking: false,
      startTime: null,
      currentSession: 0,
      totalToday: this.totalToday
    });
    
    this.updateDisplay();
    await this.saveWorkRecord(sessionDuration);
  }

  updateDisplay() {
    const currentSessionEl = document.querySelector('.current-session');
    const totalTodayEl = document.querySelector('.total-today');
    
    if (currentSessionEl && totalTodayEl) {
      currentSessionEl.textContent = this.formatTime(this.currentSession);
      totalTodayEl.textContent = `${(this.totalToday / 3600).toFixed(1)}시간`;
    }
  }

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  async saveWorkRecord(sessionDuration) {
    // 작업 기록 저장 로직 구현
  }

  handleDateChange() {
    if (!this.isWorking) return;
    
    // 현재 세션 종료
    const currentSession = this.currentSession;
    this.stopWork();
    
    // 새로운 날짜로 세션 시작
    this.startWork();
    
    // 이전 날짜의 작업 시간 저장
    StorageManager.saveWorkRecord({
      date: new Date(this.sessionStart).toISOString().split('T')[0],
      duration: currentSession,
      endTime: new Date().toISOString()
    });
  }
} 