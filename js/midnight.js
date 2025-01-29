class MidnightManager {
  constructor(workManager) {
    this.workManager = workManager;
    this.midnightTimer = null;
    this.setupMidnightCheck();
  }

  setupMidnightCheck() {
    // 다음 자정까지의 시간 계산
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow - now;
    
    // 자정 체크 타이머 설정
    this.midnightTimer = setTimeout(() => {
      this.handleMidnightTransition();
      // 다음 자정 체크 설정
      this.setupMidnightCheck();
    }, msUntilMidnight);
  }

  async handleMidnightTransition() {
    try {
      const state = this.workManager.state;
      if (!state.isWorking) return;

      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      const startTime = new Date(state.startTime);

      // 1. 현재 세션 자동 종료
      const session = {
        date: startTime.toISOString().split('T')[0],
        startTime: state.startTime,
        endTime: midnight.toISOString(),
        duration: Math.floor((midnight - startTime) / 1000)
      };
      await StorageManager.saveWorkRecord(session);

      // 2. 새로운 날짜로 자동 시작
      await this.workManager.startNewDaySession(midnight);

      // 3. 이메일 리포트 데이터 정리
      await this.prepareEmailReport(session.date);

      console.log('자정 전환 처리 완료:', {
        이전세션: {
          날짜: session.date,
          시작: new Date(session.startTime).toLocaleTimeString(),
          종료: '23:59',
          시간: Math.floor(session.duration / 3600)
        },
        새세션시작: midnight.toLocaleTimeString()
      });

    } catch (error) {
      console.error('자정 전환 처리 실패:', error);
      await this.handleMidnightError();
    }
  }

  async prepareEmailReport(date) {
    try {
      const dailyRecords = await StorageManager.getDailyRecords(date);
      const processedRecords = this.processRecordsForReport(dailyRecords);
      await StorageManager.saveProcessedRecords(date, processedRecords);
    } catch (error) {
      console.error('리포트 데이터 준비 실패:', error);
    }
  }

  processRecordsForReport(records) {
    return records.map(record => ({
      ...record,
      duration: this.calculateAccurateDuration(record)
    }));
  }

  calculateAccurateDuration(record) {
    const start = new Date(record.startTime);
    const end = new Date(record.endTime);
    return Math.floor((end - start) / 1000);
  }

  async handleMidnightError() {
    try {
      // 1. 현재 상태 백업
      await StorageManager.createBackup(this.workManager.state);

      // 2. 마지막 유효한 상태 복원
      const lastValidState = await StorageManager.getLastValidState();
      if (lastValidState) {
        await this.workManager.restoreState(lastValidState);
      }

      // 3. 에러 로그 저장
      await StorageManager.saveErrorLog({
        type: 'MIDNIGHT_TRANSITION_ERROR',
        timestamp: new Date().toISOString(),
        state: this.workManager.state
      });

    } catch (error) {
      console.error('자정 에러 복구 실패:', error);
    }
  }

  destroy() {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }
  }
}

// 전역 스코프에서 사용 가능하도록 설정
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MidnightManager };
} 