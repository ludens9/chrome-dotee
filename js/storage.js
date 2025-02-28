class WorkSession {
  constructor(startTime) {
    // 모든 시간을 timestamp로 통일
    this.startTime = this.normalizeTime(startTime);
    this.endTime = null;
    this.duration = 0;
    // 시작 시간 기준으로 날짜 결정 (변경 불가)
    this._date = new Date(this.startTime).toISOString().split('T')[0];
  }

  // date는 읽기 전용
  get date() {
    return this._date;
  }

  normalizeTime(time) {
    if (typeof time === 'string') {
      // ISO string을 timestamp로 변환
      return new Date(time).getTime();
    }
    return time;
  }

  end(endTime) {
    this.endTime = this.normalizeTime(endTime);
    
    // 시작 시간과 종료 시간의 유효성 검사
    if (this.endTime < this.startTime) {
      throw new Error('종료 시간이 시작 시간보다 앞설 수 없습니다');
    }
    
    // 자정을 넘기는 경우 처리
    const startDate = new Date(this.startTime);
    const endDate = new Date(this.endTime);
    
    if (endDate.getDate() !== startDate.getDate()) {
      // 1. 현재 세션을 자정까지로 조정
      const midnight = new Date(startDate);
      midnight.setHours(23, 59, 59, 999);
      this.endTime = midnight.getTime();
      this.duration = Math.floor((this.endTime - this.startTime) / 1000);

      // 2. 다음 날 세션 생성
      const nextDayStart = new Date(endDate);
      nextDayStart.setHours(0, 0, 0, 0);
      const nextSession = new WorkSession(nextDayStart.getTime());
      nextSession.end(endTime);

      return nextSession;
    }
    
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
    return null;
  }

  isValid() {
    return (
      this.startTime && 
      this.endTime && 
      this.duration > 0 && 
      this.endTime >= this.startTime
    );
  }

  toJSON() {
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      date: this.date
    };
  }

  // 디버그용 메서드
  toString() {
    return `세션 정보:
    날짜: ${this.date}
    시작: ${new Date(this.startTime).toLocaleString()}
    종료: ${this.endTime ? new Date(this.endTime).toLocaleString() : '진행중'}
    시간: ${this.duration}초 (${(this.duration / 3600).toFixed(2)}시간)`;
  }
}

class StorageManager {
  static KEYS = {
    CURRENT_SESSION: 'currentSession',
    WORK_RECORDS: 'workRecords_',  // 날짜별로 저장 (workRecords_2025-02-06)
    SETTINGS: 'settings'
  };

  static async startSession() {
    const now = Date.now();
    const session = new WorkSession(now);
    await this.saveCurrentSession(session);
    
    console.log('새 세션 시작:', {
      시작시간: new Date(now).toLocaleString()
    });
    
    return session;
  }

  static async endSession() {
    const session = await this.getCurrentSession();
    if (!session) return null;

    session.end(Date.now());
    if (session.isValid()) {
      await this.saveWorkRecord(session);
      await this.clearCurrentSession();
      
      console.log('세션 종료:', {
        시작: new Date(session.startTime).toLocaleString(),
        종료: new Date(session.endTime).toLocaleString(),
        시간: session.duration / 3600
      });
    }
    return session;
  }

  static async handleMidnight() {
    const currentSession = await this.getCurrentSession();
    if (!currentSession) return;

    try {
      // 1. 현재 세션 종료
      const nextSession = currentSession.end(Date.now());
      await this.saveWorkRecord(currentSession);

      // 2. 다음 날 세션이 있으면 저장
      if (nextSession) {
        await this.saveWorkRecord(nextSession);
        await this.saveCurrentSession(nextSession);
        
        console.log('자정 처리 완료:', {
          이전세션: currentSession.toString(),
          새세션: nextSession.toString()
        });
      } else {
        await this.clearCurrentSession();
      }
    } catch (error) {
      console.error('자정 처리 실패:', error);
      throw error;
    }
  }

  static async saveWorkRecord(session) {
    try {
      if (!session.isValid()) {
        throw new Error('유효하지 않은 세션입니다: ' + session.toString());
      }

      // 세션의 날짜로 키 생성 (시작 시간 기준)
      const key = this.KEYS.WORK_RECORDS + session.date;
      const data = await chrome.storage.local.get(key);
      const records = data[key] || [];

      // 중복 체크
      if (this.isDuplicateSession(records, session)) {
        console.warn('중복된 세션이 감지되었습니다:', session.toString());
        return;
      }

      // 세션 저장
      records.push(session.toJSON());
      await chrome.storage.local.set({ [key]: records });

      console.log('근무 기록 저장 완료:', {
        날짜: session.date,
        시작: new Date(session.startTime).toLocaleString(),
        종료: new Date(session.endTime).toLocaleString(),
        시간: (session.duration / 3600).toFixed(2) + '시간'
      });
    } catch (error) {
      console.error('근무 기록 저장 실패:', error);
      throw error;
    }
  }

  static isDuplicateSession(records, newSession) {
    return records.some(record => 
      record.startTime === newSession.startTime && 
      record.endTime === newSession.endTime
    );
  }

  static async getDailyStats(date) {
    try {
      const dateStr = new Date(date).toISOString().split('T')[0];
      const records = await this.getWorkRecords(dateStr);
      
      // 완료된 세션들의 시간만 합산
      const completedTotal = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      
      // 현재 진행중인 세션이 있다면 해당 날짜의 것만 계산
      const currentSession = await this.getCurrentSession();
      let currentSessionTime = 0;
      
      if (currentSession) {
        const sessionDate = new Date(currentSession.startTime).toISOString().split('T')[0];
        if (sessionDate === dateStr) {
          currentSessionTime = Math.floor((Date.now() - currentSession.startTime) / 1000);
        }
      }

      return {
        totalDuration: completedTotal + currentSessionTime,
        sessionCount: records.length + (currentSessionTime > 0 ? 1 : 0)
      };
    } catch (error) {
      console.error('일간 통계 계산 실패:', error);
      return { totalDuration: 0, sessionCount: 0 };
    }
  }

  static async saveSettings(settings) {
    try {
      // 유효성 검사
      if (!settings.email || !settings.reportTime) {
        throw new Error('필수 설정값이 누락되었습니다.');
      }

      // 설정 저장
      await chrome.storage.local.set({
        email: settings.email,
        reportTime: settings.reportTime,
        autoStopHours: settings.autoStopHours || 0
      });

      console.log('설정 저장됨:', {
        이메일: settings.email,
        발송시간: settings.reportTime,
        자동중지: settings.autoStopHours
      });

      return true;
    } catch (error) {
      console.error('설정 저장 실패:', error);
      throw error;
    }
  }

  static async getSettings() {
    try {
      const settings = await chrome.storage.local.get({
        email: '',
        reportTime: '09:00',
        autoStopHours: 2  // 기본값 2시간으로 변경
      });
      
      console.log('설정 조회:', settings);
      return settings;
    } catch (error) {
      console.error('설정 조회 실패:', error);
      throw error;
    }
  }

  static async getWorkStatus() {
    try {
      const { workStatus } = await chrome.storage.local.get('workStatus');
      return workStatus;
    } catch (error) {
      console.error('작업 상태 조회 실패:', error);
      return null;
    }
  }

  static async saveWorkStatus(status) {
    try {
      await chrome.storage.local.set({ workStatus: status });
      return true;
    } catch (error) {
      console.error('작업 상태 저장 실패:', error);
      throw error;
    }
  }

  static async getWorkRecords(dateStr) {
    try {
      // 날짜가 Date 객체인 경우 문자열로 변환
      if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
      }
      
      // 기존 형식의 키로 데이터 조회
      const key = this.KEYS.WORK_RECORDS + dateStr;
      const data = await chrome.storage.local.get(key);
      const records = data[key] || [];
      
      console.log('근무 기록 조회:', {
        날짜: dateStr,
        키: key,
        기록수: records.length,
        총시간: records.reduce((sum, r) => sum + r.duration, 0) / 3600
      });
      
      return records;
    } catch (error) {
      console.error('근무 기록 조회 실패:', error);
      return [];
    }
  }

  static async getWeeklyTotal(baseDate = new Date()) {
    try {
      const weekStart = new Date(baseDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());  // 주의 시작일 (일요일)
      weekStart.setHours(0, 0, 0, 0);
      
      let weekTotal = 0;
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(currentDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // 해당 날짜의 완료된 세션만 합산
        const records = await this.getWorkRecords(dateStr);
        weekTotal += records.reduce((sum, record) => sum + (record.duration || 0), 0);
      }
      
      return weekTotal;
    } catch (error) {
      console.error('주간 합계 계산 실패:', error);
      return 0;
    }
  }

  static async getMonthlyTotal(baseDate = new Date()) {
    try {
      const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      
      let monthTotal = 0;
      for (let date = new Date(monthStart); date <= monthEnd; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        // 해당 날짜의 완료된 세션만 합산
        const records = await this.getWorkRecords(dateStr);
        monthTotal += records.reduce((sum, record) => sum + (record.duration || 0), 0);
      }
      
      return monthTotal;
    } catch (error) {
      console.error('월간 합계 계산 실패:', error);
      return 0;
    }
  }

  static async updateCurrentSession(seconds) {
    const status = await this.getWorkStatus();
    status.currentSession = seconds;
    return this.saveWorkStatus(status);
  }

  static async updateTotalToday(seconds) {
    const status = await this.getWorkStatus();
    status.totalToday = seconds;
    return this.saveWorkStatus(status);
  }

  static async resetDailyStatus() {
    const status = await this.getWorkStatus();
    status.totalToday = 0;
    status.currentSession = 0;
    return this.saveWorkStatus(status);
  }

  static async getDailyRecord(date) {
    const records = await this.getWorkRecords();
    return records[date] || {
      totalTime: 0,
      sessions: []
    };
  }

  static async saveDailyRecord(date, record) {
    const records = await this.getWorkRecords();
    records[date] = record;
    await chrome.storage.local.set({ workRecords: records });
  }

  static async clearTodayData() {
    const status = await this.getWorkStatus();
    status.currentSession = 0;
    status.totalToday = 0;
    status.savedTotalToday = 0;
    await this.saveWorkStatus(status);
  }

  static async getLastWeekTotal(baseDate = new Date()) {
    try {
      const lastWeekDate = new Date(baseDate);
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);
      return await this.getWeeklyTotal(lastWeekDate);
    } catch (error) {
      console.error('지난주 합계 계산 실패:', error);
      return 0;
    }
  }

  static async getLastMonthTotal(baseDate = new Date()) {
    try {
      const lastMonth = new Date(baseDate);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return await this.getMonthlyTotal(lastMonth);
    } catch (error) {
      console.error('지난달 합계 계산 실패:', error);
      return 0;
    }
  }

  static async calculateDailyTotal(date) {
    try {
      const dateStr = new Date(date).toISOString().split('T')[0];
      const dayRecords = await this.getWorkRecords(dateStr) || [];
      
      // 유효한 기록만 필터링
      const validRecords = dayRecords.filter(record => {
        const start = new Date(record.startTime);
        const end = new Date(record.endTime);
        return start < end && record.duration > 0;
      });
      
      // 총 시간 계산
      return validRecords.reduce((total, record) => total + record.duration, 0);
    } catch (error) {
      console.error('일간 합계 계산 실패:', error);
      return 0;
    }
  }

  static async createBackup(state) {
    const backup = {
      timestamp: new Date().toISOString(),
      state: state
    };
    
    const { backups = [] } = await chrome.storage.local.get('backups');
    backups.push(backup);
    
    // 최대 10개까지만 보관
    if (backups.length > 10) {
      backups.shift();
    }
    
    await chrome.storage.local.set({ backups });
  }

  static async getLastValidState() {
    const { backups = [] } = await chrome.storage.local.get('backups');
    return backups.length > 0 ? backups[backups.length - 1].state : null;
  }

  static async saveProcessedRecords(date, records) {
    try {
      await chrome.storage.local.set({
        [`processed_records_${date}`]: records
      });
      console.log('처리된 기록 저장:', {
        날짜: date,
        기록수: records.length
      });
    } catch (error) {
      console.error('처리된 기록 저장 실패:', error);
      throw error;
    }
  }

  // 테스트용 메서드들
  static async debugStorage() {
    try {
      const allData = await chrome.storage.local.get(null);
      console.group('스토리지 전체 데이터');
      console.log('전체 데이터:', allData);
      
      if (allData.workRecords) {
        console.group('근무 기록 상세');
        Object.entries(allData.workRecords).forEach(([date, records]) => {
          console.log(`${date}:`, {
            기록수: records.length,
            총시간: records.reduce((sum, r) => sum + r.duration, 0) / 3600,
            세부기록: records
          });
        });
        console.groupEnd();
      }

      if (allData.workStatus) {
        console.group('현재 상태');
        console.log('작업중:', allData.workStatus.isWorking);
        console.log('시작시간:', allData.workStatus.startTime);
        console.log('현재세션:', allData.workStatus.currentSession);
        console.log('오늘누적:', allData.workStatus.totalToday);
        console.groupEnd();
      }

      console.groupEnd();
    } catch (error) {
      console.error('디버그 조회 실패:', error);
    }
  }

  static async saveCurrentSession(session) {
    await chrome.storage.local.set({
      [this.KEYS.CURRENT_SESSION]: session
    });
  }

  static async getCurrentSession() {
    const data = await chrome.storage.local.get(this.KEYS.CURRENT_SESSION);
    const session = data[this.KEYS.CURRENT_SESSION];
    return session ? Object.assign(new WorkSession(session.startTime), session) : null;
  }

  static async clearCurrentSession() {
    await chrome.storage.local.remove(this.KEYS.CURRENT_SESSION);
  }

  static async migrateWorkRecords() {
    try {
      const allData = await chrome.storage.local.get(null);
      const workRecordKeys = Object.keys(allData).filter(key => 
        key.startsWith('workRecords_')
      );
      
      for (const key of workRecordKeys) {
        const records = allData[key];
        const processedRecords = new Map(); // 날짜별 기록 관리

        for (const record of records) {
          // 새 세션 생성 (시작 시간 기준으로 날짜 결정)
          const session = new WorkSession(record.startTime);
          if (record.endTime) {
            const nextSession = session.end(record.endTime);
            
            // 현재 세션 저장
            const currentDate = session.date;
            if (!processedRecords.has(currentDate)) {
              processedRecords.set(currentDate, []);
            }
            processedRecords.get(currentDate).push(session.toJSON());

            // 자정을 넘긴 경우 다음 세션도 저장
            if (nextSession) {
              const nextDate = nextSession.date;
              if (!processedRecords.has(nextDate)) {
                processedRecords.set(nextDate, []);
              }
              processedRecords.get(nextDate).push(nextSession.toJSON());
            }
          }
        }

        // 날짜별로 저장
        for (const [date, sessions] of processedRecords) {
          const recordKey = `workRecords_${date}`;
          await chrome.storage.local.set({ [recordKey]: sessions });
          console.log(`${date} 기록 마이그레이션 완료:`, sessions.length);
        }
      }

      console.log('전체 마이그레이션 완료');
    } catch (error) {
      console.error('마이그레이션 실패:', error);
      throw error;
    }
  }
}

// 전역 객체에 할당
self.StorageManager = StorageManager;