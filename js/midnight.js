class MidnightManager {
  constructor(workManager) {
    this.workManager = workManager;
    this.hourlyTimer = null;
    this.startHourlyCheck();
  }

  startHourlyCheck() {
    // 더 자주 체크하여 정확도 향상
    this.hourlyTimer = setInterval(() => {
      this.checkMidnight();
    }, 30 * 1000); // 30초마다 체크
  }

  async checkMidnight() {
    try {
      const session = await StorageManager.getCurrentSession();
      if (!session) return;

      const now = new Date();
      const sessionStart = new Date(session.startTime);
      
      // 날짜가 변경되었는지 확인 (더 정확한 비교)
      if (this.isDifferentDay(now, sessionStart)) {
        console.log('자정 넘김 감지:', {
          시작일시: sessionStart.toLocaleString(),
          현재일시: now.toLocaleString()
        });
        await this.handleMidnightTransition();
      }
    } catch (error) {
      console.error('자정 체크 실패:', error);
    }
  }

  isDifferentDay(date1, date2) {
    return date1.getFullYear() !== date2.getFullYear() ||
           date1.getMonth() !== date2.getMonth() ||
           date1.getDate() !== date2.getDate();
  }

  async handleMidnightTransition() {
    try {
      const session = await StorageManager.getCurrentSession();
      if (!session) return;

      // 1. 자정 시간 정확히 계산 (이전 날짜의 마지막 시점)
      const sessionStart = new Date(session.startTime);
      const midnight = new Date(sessionStart);
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 0, 0);
      
      // 2. 이전 날짜의 세션 종료 및 저장
      const prevSession = new WorkSession(session.startTime);
      prevSession.end(midnight.getTime() - 1); // 23:59:59.999로 종료
      await StorageManager.saveWorkRecord(prevSession);

      // 3. 새로운 날짜의 세션 시작
      const newSession = new WorkSession(midnight.getTime());
      await StorageManager.saveCurrentSession(newSession);

      console.log('자정 처리 완료:', {
        이전세션: {
          시작: new Date(prevSession.startTime).toLocaleString(),
          종료: new Date(prevSession.endTime).toLocaleString(),
          시간: (prevSession.duration / 3600).toFixed(2) + '시간'
        },
        새세션: {
          시작: new Date(newSession.startTime).toLocaleString()
        }
      });

    } catch (error) {
      console.error('자정 처리 실패:', error);
      await this.handleMidnightError();
    }
  }

  async handleMidnightError() {
    try {
      // 현재 세션 상태 백업
      const session = await StorageManager.getCurrentSession();
      if (session) {
        await StorageManager.createBackup({
          type: 'MIDNIGHT_ERROR',
          timestamp: new Date().toISOString(),
          session: session.toJSON()
        });
      }

      // 세션 강제 종료
      const now = new Date();
      now.setSeconds(0, 0); // 정각으로 맞춤
      
      if (session) {
        session.end(now.getTime());
        await StorageManager.saveWorkRecord(session);
      }
      
      // 새로운 세션 시작
      const newSession = new WorkSession(now.getTime());
      await StorageManager.saveCurrentSession(newSession);

      console.log('자정 에러 복구 완료:', {
        이전세션: session ? session.toString() : '없음',
        새세션: newSession.toString()
      });
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