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

      // 2. 새로운 날짜로 즉시 시작 (모든 누적 시간 초기화)
      const newState = {
        isWorking: true,
        startTime: midnight.getTime(),
        currentSession: Math.floor((now - midnight) / 1000),
        totalToday: Math.floor((now - midnight) / 1000),  // 자정 이후 시간만 계산
        savedTotalToday: 0,  // 새로운 날짜이므로 0으로 초기화
        autoStopHours: state.autoStopHours
      };

      // 상태 업데이트
      this.workManager.state = newState;
      await StorageManager.saveWorkStatus(newState);

      console.log('자정 전환 완료:', {
        이전세션: session,
        새세션: newState,
        자정이후시간: Math.floor((now - midnight) / 1000)
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