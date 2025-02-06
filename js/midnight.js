class MidnightManager {
  constructor(workManager) {
    this.workManager = workManager;
    this.hourlyTimer = null;
    this.startHourlyCheck();
  }

  startHourlyCheck() {
    // 매시간 자정 체크
    this.hourlyTimer = setInterval(() => {
      this.checkMidnight();
    }, 60 * 60 * 1000); // 1시간마다
  }

  async checkMidnight() {
    const state = this.workManager.state;
    if (!state.isWorking) return;

    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      await this.handleMidnightTransition();
    }
  }

  async handleMidnightTransition() {
    try {
      const state = this.workManager.state;
      if (!state.isWorking) return;

      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      
      // 1. 이전 날짜의 세션 저장
      const session = {
        startTime: state.startTime,
        endTime: midnight.getTime(),
        duration: Math.floor((midnight.getTime() - state.startTime) / 1000)
      };

      await StorageManager.saveWorkRecord(session);

      // 2. 새로운 날짜로 즉시 시작
      const newSession = {
        isWorking: true,
        startTime: midnight.getTime(),
        currentSession: 0,
        totalToday: 0,
        savedTotalToday: 0,
        autoStopHours: state.autoStopHours
      };

      // 상태 업데이트
      this.workManager.state = newSession;
      await StorageManager.saveWorkStatus(newSession);

      console.log('자정 전환 완료:', {
        이전세션: session,
        새세션: newSession
      });

    } catch (error) {
      console.error('자정 전환 실패:', error);
      await this.handleMidnightError();
    }
  }

  async handleMidnightError() {
    try {
      await StorageManager.createBackup(this.workManager.state);
      const lastValidState = await StorageManager.getLastValidState();
      if (lastValidState) {
        await this.workManager.restoreState(lastValidState);
      }
    } catch (error) {
      console.error('자정 에러 복구 실패:', error);
    }
  }

  destroy() {
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
    }
  }
}

// 전역 스코프에서 사용 가능하도록 설정
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MidnightManager };
} 