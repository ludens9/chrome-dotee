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
      // 필수 필드 검증
      if (!record.startTime || !record.endTime || !record.duration) {
        console.error('잘못된 기록 형식:', record);
        return;
      }

      // 시작 시간과 종료 시간이 유효한지 확인
      const startTime = new Date(record.startTime);
      const endTime = new Date(record.endTime);
      
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        console.error('잘못된 시간 형식:', record);
        return;
      }

      // 현재 시간과 비교하여 유효성 검사
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);

      if (startTime < oneYearAgo || endTime > now) {
        console.error('유효하지 않은 시간 범위:', {
          시작: startTime.toLocaleString(),
          종료: endTime.toLocaleString()
        });
        return;
      }

      // duration 유효성 검사
      const calculatedDuration = Math.floor((endTime - startTime) / 1000);
      if (Math.abs(calculatedDuration - record.duration) > 60) { // 1분 이상 차이나면 오류
        console.error('시간 계산 불일치:', {
          계산된_시간: calculatedDuration,
          기록된_시간: record.duration
        });
        return;
      }

      // 날짜는 시작 시간을 기준으로 결정
      const dateStr = startTime.toISOString().split('T')[0];
      const { workRecords = {} } = await chrome.storage.local.get('workRecords');
      
      if (!workRecords[dateStr]) {
        workRecords[dateStr] = [];
      }

      // 새로운 기록 추가
      workRecords[dateStr].push({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: record.duration,
        date: dateStr
      });

      console.log('근무 기록 저장:', {
        날짜: dateStr,
        시작: startTime.toLocaleString(),
        종료: endTime.toLocaleString(),
        시간: `${Math.floor(record.duration/3600)}시간 ${Math.floor((record.duration%3600)/60)}분`
      });

      // 시간순 정렬
      workRecords[dateStr].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      
      await chrome.storage.local.set({ workRecords });
      
    } catch (error) {
      console.error('근무 기록 저장 실패:', error);
    }
  }

  static async getWorkRecords() {
    try {
      const { workRecords } = await chrome.storage.local.get('workRecords');
      return workRecords || {};
    } catch (error) {
      console.error('근무 기록 조회 실패:', error);
      return {};
    }
  }

  static async getWeeklyTotal(baseDate = new Date()) {
    try {
      const records = await this.getWorkRecords();
      const weekStart = new Date(baseDate);
      const day = weekStart.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;  // 일요일이면 -6, 아니면 1-day
      weekStart.setDate(weekStart.getDate() + mondayOffset);  // 월요일로 설정
      weekStart.setHours(0, 0, 0, 0);
      
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const baseDateStr = baseDate.toISOString().split('T')[0];
      
      console.log('주간 범위:', {
          시작일: weekStartStr,
          종료일: baseDateStr
      });
      
      let weekTotal = 0;
      Object.entries(records)
          .filter(([date]) => date >= weekStartStr && date <= baseDateStr)
          .sort()  // 날짜순 정렬
          .forEach(([date, dayRecords]) => {
              const dayTotal = dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
              console.log(`${date} 근무:`, (dayTotal / 3600).toFixed(1) + '시간');
              weekTotal += dayTotal;
          });
      
      console.log('주간 누적:', (weekTotal / 3600).toFixed(1) + '시간');
      return weekTotal;
    } catch (error) {
      console.error('주간 합계 계산 실패:', error);
      return 0;
    }
  }

  static async getMonthlyTotal(baseDate = new Date()) {
    try {
      const records = await this.getWorkRecords();
      const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthStartStr = monthStart.toISOString().split('T')[0];
      const baseDateStr = baseDate.toISOString().split('T')[0];
      
      console.log('월간 범위:', {
          시작일: monthStartStr,
          종료일: baseDateStr
      });
      
      let monthTotal = 0;
      Object.entries(records)
          .filter(([date]) => date >= monthStartStr && date <= baseDateStr)
          .forEach(([date, dayRecords]) => {
              const dayTotal = dayRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
              console.log(`${date} 누적:`, dayTotal / 3600, '시간');
              monthTotal += dayTotal;
          });
      
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
      return workStatus || {
        isWorking: false,
        startTime: null,
        currentSession: 0,
        totalToday: 0,
        autoStopHours: 0
      };
    } catch (error) {
      console.error('Failed to get work status:', error);
      return {
        isWorking: false,
        startTime: null,
        currentSession: 0,
        totalToday: 0,
        autoStopHours: 0
      };
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
      const lastWeekEnd = new Date(baseDate);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);  // 일주일 전으로
      return this.getWeeklyTotal(lastWeekEnd);
    } catch (error) {
      console.error('지난주 합계 계산 실패:', error);
      return 0;
    }
  }

  static async getLastMonthTotal(baseDate = new Date()) {
    try {
      const lastMonthEnd = new Date(baseDate);
      lastMonthEnd.setMonth(lastMonthEnd.getMonth() - 1);  // 한 달 전으로
      return this.getMonthlyTotal(lastMonthEnd);
    } catch (error) {
      console.error('지난달 합계 계산 실패:', error);
      return 0;
    }
  }
} 