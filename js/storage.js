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
      if (!this.isValidWorkStatus(status)) {
        return;
      }

      // 단순화된 저장 로직
      await chrome.storage.local.set({ 
        workStatus: status,
        workStatusBackup: {
          status,
          timestamp: Date.now()
        }
      });

      // 저장 확인
      const { workStatus } = await chrome.storage.local.get('workStatus');
      if (!workStatus || !this.isValidWorkStatus(workStatus)) {
        throw new Error('Status save verification failed');
      }

    } catch (error) {
      // 백업에서 복구 시도
      const { workStatusBackup } = await chrome.storage.local.get('workStatusBackup');
      if (workStatusBackup && workStatusBackup.status) {
        await chrome.storage.local.set({ workStatus: workStatusBackup.status });
      }
      throw error;
    }
  }

  static async getWorkStatus() {
    try {
      const { workStatus } = await chrome.storage.local.get('workStatus');
      if (workStatus && this.isValidWorkStatus(workStatus)) {
        return workStatus;
      }
      return await this.recoverWorkStatus();
    } catch (error) {
      return this.getDefaultWorkStatus();
    }
  }

  static isValidWorkStatus(status) {
    return status && 
           typeof status.isWorking === 'boolean' &&
           (status.startTime === null || typeof status.startTime === 'string') &&
           typeof status.currentSession === 'number' &&
           typeof status.totalToday === 'number' &&
           typeof status.savedTotalToday === 'number';
  }

  static getDefaultWorkStatus() {
    return {
      isWorking: false,
      startTime: null,
      currentSession: 0,
      totalToday: 0,
      savedTotalToday: 0,
      autoStopHours: 0
    };
  }

  static async recoverWorkStatus() {
    try {
      const { lastTransactionKey } = await chrome.storage.local.get('lastTransactionKey');
      if (lastTransactionKey) {
        const { [lastTransactionKey]: lastStatus } = await chrome.storage.local.get(lastTransactionKey);
        if (lastStatus && this.isValidWorkStatus(lastStatus)) {
          return lastStatus;
        }
      }
      return this.getDefaultWorkStatus();
    } catch (error) {
      return this.getDefaultWorkStatus();
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

  static async acquireLock(key) {
    const timestamp = Date.now();
    const { lock } = await chrome.storage.local.get(key);
    
    if (lock && timestamp - lock.timestamp < 5000) {
      return false;
    }
    
    await chrome.storage.local.set({ [key]: { timestamp } });
    return true;
  }

  static async releaseLock(key) {
    await chrome.storage.local.remove(key);
  }

  static async createBackup(status) {
    try {
      const backupKey = `backup_${Date.now()}`;
      await chrome.storage.local.set({
        [backupKey]: {
          status,
          timestamp: Date.now()
        },
        currentBackupKey: backupKey
      });
    } catch (error) {
      console.error('백업 생성 실패:', error);
      throw error;
    }
  }

  static async verifyBackup(status) {
    try {
      const { currentBackupKey } = await chrome.storage.local.get('currentBackupKey');
      if (!currentBackupKey) return false;

      const { [currentBackupKey]: backup } = await chrome.storage.local.get(currentBackupKey);
      return backup && 
             this.isValidWorkStatus(backup.status) &&
             JSON.stringify(backup.status) === JSON.stringify(status);
    } catch (error) {
      return false;
    }
  }

  static async restoreFromBackup() {
    try {
      const { currentBackupKey } = await chrome.storage.local.get('currentBackupKey');
      if (!currentBackupKey) throw new Error('No backup found');

      const { [currentBackupKey]: backup } = await chrome.storage.local.get(currentBackupKey);
      if (!backup || !this.isValidWorkStatus(backup.status)) {
        throw new Error('Invalid backup data');
      }

      await chrome.storage.local.set({ workStatus: backup.status });
      return backup.status;
    } catch (error) {
      console.error('백업 복구 실패:', error);
      throw error;
    }
  }

  static async clearBackup() {
    try {
      const { currentBackupKey } = await chrome.storage.local.get('currentBackupKey');
      if (currentBackupKey) {
        await chrome.storage.local.remove([currentBackupKey, 'currentBackupKey']);
      }
    } catch (error) {
      console.error('백업 정리 실패:', error);
    }
  }
} 