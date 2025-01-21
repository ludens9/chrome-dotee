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
      const startDate = new Date(record.startTime);
      const dateStr = startDate.toISOString().split('T')[0];
      
      const { workRecords = {} } = await chrome.storage.local.get('workRecords');
      
      console.log('근무 기록 저장:', {
        기준날짜: dateStr,
        시작시간: new Date(record.startTime).toLocaleString(),
        종료시간: new Date(record.endTime).toLocaleString(),
        근무시간: (record.duration / 3600).toFixed(1) + '시간'
      });
      
      if (!workRecords[dateStr]) {
        workRecords[dateStr] = [];
      }
      
      const endDate = new Date(record.endTime);
      const endDateStr = endDate.toISOString().split('T')[0];
      
      if (dateStr !== endDateStr) {
        const midnight = new Date(endDateStr);
        midnight.setHours(0, 0, 0, 0);
        
        const firstDayDuration = Math.floor((midnight - startDate) / 1000);
        workRecords[dateStr].push({
          startTime: record.startTime,
          endTime: midnight.toISOString(),
          duration: firstDayDuration,
          date: dateStr
        });
        
        const secondDayDuration = Math.floor((endDate - midnight) / 1000);
        if (!workRecords[endDateStr]) {
          workRecords[endDateStr] = [];
        }
        workRecords[endDateStr].push({
          startTime: midnight.toISOString(),
          endTime: record.endTime,
          duration: secondDayDuration,
          date: endDateStr
        });
        
        console.log('자정 넘김 처리:', {
          첫째날: `${dateStr} (${firstDayDuration / 3600}시간)`,
          둘째날: `${endDateStr} (${secondDayDuration / 3600}시간)`
        });
      } else {
        workRecords[dateStr].push({
          ...record,
          date: dateStr
        });
      }
      
      await chrome.storage.local.set({ workRecords });
      console.log('저장 완료된 전체 기록:', workRecords);
    } catch (error) {
      console.error('Failed to save work record:', error);
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
      await chrome.storage.local.set({ workStatus: status });
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