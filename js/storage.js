class StorageManager {
  static async saveSettings(settings) {
    return chrome.storage.local.set(settings);
  }

  static async getSettings() {
    return chrome.storage.local.get({
      email: '',
      reportTime: '09:00',
      autoStopHours: 0
    });
  }

  static async saveWorkRecord(record) {
    try {
      // ISO 날짜 문자열로 변환
      const dateStr = new Date(record.startTime).toISOString().split('T')[0];
      const key = `workRecords_${dateStr}`;
      
      // 기존 기록 가져오기
      const data = await chrome.storage.local.get(key);
      const records = data[key] || [];
      
      // 유효성 검사
      if (!record.startTime || !record.endTime || !record.duration) {
        console.error('유효하지 않은 근무 기록:', record);
        return;
      }
      
      // 새 기록 추가
      records.push(record);
      
      console.log('근무 기록 저장:', {
        키: key,
        날짜: dateStr,
        시작: new Date(record.startTime).toLocaleString(),
        종료: new Date(record.endTime).toLocaleString(),
        시간: Math.floor(record.duration / 3600)
      });

      // 저장
      await chrome.storage.local.set({ [key]: records });
    } catch (error) {
      console.error('근무 기록 저장 실패:', error);
      throw error;
    }
  }

  static async getWorkRecords(date) {
    try {
      // 1. 전체 데이터 가져오기
      const allData = await chrome.storage.local.get(null);
      
      // 2. workRecords로 시작하는 모든 키 찾기
      const workRecordKeys = Object.keys(allData).filter(key => key.startsWith('workRecords_'));
      
      if (!date) {
        // 날짜 없이 호출되면 모든 기록 반환
        const allRecords = {};
        workRecordKeys.forEach(key => {
          const dateStr = key.replace('workRecords_', '');
          allRecords[dateStr] = allData[key];
        });
        return allRecords;
      }

      // 3. 날짜 객체 생성 및 키 형식 통일
      const dateObj = new Date(date);
      const isoDateStr = dateObj.toISOString().split('T')[0];  // YYYY-MM-DD
      const key = `workRecords_${isoDateStr}`;

      console.log('근무 기록 조회:', {
        요청날짜: date,
        변환날짜: isoDateStr,
        조회키: key,
        저장된키목록: workRecordKeys,
        데이터존재: !!allData[key]
      });

      // 4. 해당 날짜의 기록 반환
      return allData[key] || [];
    } catch (error) {
      console.error('근무 기록 조회 실패:', error);
      console.error('상세 에러:', {
        에러메시지: error.message,
        스택: error.stack,
        입력날짜: date
      });
      return [];
    }
  }

  static async getWeeklyTotal(baseDate = new Date()) {
    try {
      // 1. 주의 시작일(월요일)과 종료일(일요일) 계산
      const weekStart = new Date(baseDate);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // 월요일로 조정
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // 일요일
      weekEnd.setHours(23, 59, 59, 999);
      
      console.log('주간 집계 범위:', {
        시작일: weekStart.toLocaleDateString(),
        종료일: weekEnd.toLocaleDateString(),
        기준일: baseDate.toLocaleDateString()
      });

      // 2. 해당 기간의 모든 기록 조회
      let weekTotal = 0;
      for (let date = new Date(weekStart); date <= weekEnd; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        const dayRecords = await this.getWorkRecords(dateStr);
        
        if (dayRecords && Array.isArray(dayRecords)) {
          const dayTotal = dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
          weekTotal += dayTotal;
          
          console.log('일간 집계:', {
            날짜: dateStr,
            요일: date.getDay(),
            기록수: dayRecords.length,
            일간합계: (dayTotal / 3600).toFixed(1) + 'h'
          });
        }
      }
      
      console.log('주간 총계:', (weekTotal / 3600).toFixed(1) + 'h');
      return weekTotal;
    } catch (error) {
      console.error('주간 합계 계산 실패:', error);
      return 0;
    }
  }

  static async getMonthlyTotal(baseDate = new Date()) {
    try {
      // 1. 월의 시작일과 종료일 계산
      const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      
      console.log('월간 집계 범위:', {
        시작일: monthStart.toLocaleDateString(),
        종료일: monthEnd.toLocaleDateString()
      });

      // 2. 해당 기간의 모든 기록 조회
      let monthTotal = 0;
      for (let date = new Date(monthStart); date <= monthEnd; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toISOString().split('T')[0];
        const dayRecords = await this.getWorkRecords(dateStr);
        
        if (dayRecords && Array.isArray(dayRecords)) {
          const dayTotal = dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
          monthTotal += dayTotal;
          
          console.log('일간 집계:', {
            날짜: dateStr,
            기록수: dayRecords.length,
            일간합계: dayTotal / 3600
          });
        }
      }
      
      console.log('월간 총계:', monthTotal / 3600);
      return monthTotal;
    } catch (error) {
      console.error('월간 합계 계산 실패:', error);
      return 0;
    }
  }

  static async saveWorkStatus(status) {
    try {
      // 저장 전 상태 로깅
      console.log('저장할 상태:', status);
      
      // 상태 저장
      await chrome.storage.local.set({ workStatus: status });
      
      // 저장 후 확인
      const saved = await chrome.storage.local.get('workStatus');
      console.log('저장된 상태:', saved.workStatus);
      
    } catch (error) {
      console.error('Failed to save work status:', error);
    }
  }

  static async getWorkStatus() {
    try {
      const { workStatus } = await chrome.storage.local.get('workStatus');
      
      // 기본 상태
      const defaultState = {
        isWorking: false,
        startTime: null,
        currentSession: 0,
        totalToday: 0,
        savedTotalToday: 0,
        autoStopHours: 2
      };

      // 저장된 상태가 없으면 기본값 반환
      if (!workStatus) {
        return defaultState;
      }

      // 저장된 상태가 있으면 날짜 확인
      const now = new Date();
      const today = now.toDateString();
      const savedDate = workStatus.startTime ? new Date(workStatus.startTime).toDateString() : null;

      // 날짜가 다르거나 유효하지 않은 시작 시간이면 초기화된 상태 반환
      if (!savedDate || savedDate !== today || workStatus.startTime < 0) {
        return {
          ...defaultState,
          autoStopHours: workStatus.autoStopHours || 2
        };
      }

      // 유효한 상태 반환
      return {
        ...defaultState,
        ...workStatus,
        // 시작 시간이 현재보다 미래면 현재 시간으로 보정
        startTime: workStatus.startTime > now.getTime() ? now.getTime() : workStatus.startTime
      };

    } catch (error) {
      console.error('작업 상태 조회 실패:', error);
      return defaultState;
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
      // 지난주의 기준일 계산 (이번주 월요일 - 7일)
      const thisMonday = new Date(baseDate);
      const day = thisMonday.getDay();
      const diff = thisMonday.getDate() - day + (day === 0 ? -6 : 1);
      thisMonday.setDate(diff);
      
      const lastWeekDate = new Date(thisMonday);
      lastWeekDate.setDate(thisMonday.getDate() - 7);
      
      console.log('지난주 계산:', {
        이번주월요일: thisMonday.toLocaleDateString(),
        지난주기준일: lastWeekDate.toLocaleDateString()
      });
      
      return this.getWeeklyTotal(lastWeekDate);
    } catch (error) {
      console.error('지난주 합계 계산 실패:', error);
      return 0;
    }
  }

  static async getLastMonthTotal(baseDate = new Date()) {
    try {
      // 지난달의 마지막 날 계산
      const lastMonthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), 0);
      return this.getMonthlyTotal(lastMonthEnd);
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
    await chrome.storage.local.set({
      [`processed_records_${date}`]: records
    });
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
            세부기록: records.map(r => ({
              시작: new Date(r.startTime).toLocaleString(),
              종료: new Date(r.endTime).toLocaleString(),
              시간: r.duration / 3600
            }))
          });
        });
        console.groupEnd();
      }

      if (allData.workStatus) {
        console.group('현재 상태');
        console.log('작업중:', allData.workStatus.isWorking);
        console.log('시작시간:', new Date(allData.workStatus.startTime).toLocaleString());
        console.log('현재세션:', allData.workStatus.currentSession);
        console.log('오늘누적:', allData.workStatus.totalToday);
        console.groupEnd();
      }

      console.groupEnd();
    } catch (error) {
      console.error('디버그 조회 실패:', error);
    }
  }

  static async testSaveRecord() {
    try {
      // 테스트 데이터 생성
      const now = new Date();
      const testRecord = {
        startTime: new Date(now.getTime() - 3600000).toISOString(), // 1시간 전
        endTime: now.toISOString(),
        duration: 3600 // 1시간
      };

      // 저장
      await this.saveWorkRecord(testRecord);
      console.log('테스트 기록 저장됨:', testRecord);

      // 저장된 데이터 확인
      await this.debugStorage();
    } catch (error) {
      console.error('테스트 저장 실패:', error);
    }
  }

  static async clearAllData() {
    try {
      await chrome.storage.local.clear();
      console.log('모든 데이터 삭제됨');
    } catch (error) {
      console.error('데이터 삭제 실패:', error);
    }
  }
}

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
} 