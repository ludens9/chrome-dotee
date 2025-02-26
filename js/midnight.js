class MidnightManager {
  constructor(workManager) {
    this.workManager = workManager;
    this.hourlyTimer = null;
    this.startHourlyCheck();
  }

  startHourlyCheck() {
    // 매분 자정 체크 (더 정확한 처리를 위해 시간 간격 축소)
    this.hourlyTimer = setInterval(() => {
      this.checkMidnight();
    }, 60 * 1000); // 1분마다
  }

  async checkMidnight() {
    const state = this.workManager.state;
    if (!state.isWorking) return;

    const now = new Date();
    const startTime = new Date(state.startTime);
    
    // 현재 시간과 시작 시간이 다른 날짜인지 확인
    if (now.getDate() !== startTime.getDate() || 
        now.getMonth() !== startTime.getMonth() || 
        now.getFullYear() !== startTime.getFullYear()) {
      await this.handleMidnightTransition();
    }
  }

  async handleMidnightTransition() {
    try {
      const state = this.workManager.state;
      if (!state.isWorking) return;

      // 1. 이전 날짜의 자정 시간 계산
      const startTime = new Date(state.startTime);
      const midnight = new Date(startTime);
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 0, 0);
      
      // 2. 이전 날짜의 세션 저장
      const previousSession = {
        startTime: state.startTime,
        endTime: midnight.toISOString(),
        duration: Math.floor((midnight.getTime() - new Date(state.startTime).getTime()) / 1000)
      };

      console.log('자정 이전 세션 저장:', {
        시작: new Date(previousSession.startTime).toLocaleString(),
        종료: new Date(previousSession.endTime).toLocaleString(),
        시간: Math.floor(previousSession.duration / 3600)
      });

      await StorageManager.saveWorkRecord(previousSession);

      // 3. 새로운 날짜로 세션 시작
      const newSession = {
        isWorking: true,
        startTime: midnight.toISOString(),
        currentSession: Math.floor((new Date().getTime() - midnight.getTime()) / 1000),
        totalToday: Math.floor((new Date().getTime() - midnight.getTime()) / 1000),
        savedTotalToday: 0,
        autoStopHours: state.autoStopHours
      };

      console.log('자정 이후 새 세션 시작:', {
        시작: new Date(newSession.startTime).toLocaleString(),
        현재세션: Math.floor(newSession.currentSession / 3600),
        총누적: Math.floor(newSession.totalToday / 3600)
      });

      // 4. 상태 업데이트
      this.workManager.state = newSession;
      await StorageManager.saveWorkStatus(newSession);

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

// 전역 객체에 할당
self.MidnightManager = MidnightManager; 