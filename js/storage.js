export class StorageManager {
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
      const date = new Date().toISOString().split('T')[0];
      const { workRecords = {} } = await chrome.storage.local.get('workRecords');
      
      if (!workRecords[date]) {
        workRecords[date] = [];
      }
      
      workRecords[date].push(record);
      await chrome.storage.local.set({ workRecords });
    } catch (error) {
      console.error('Failed to save work record:', error);
    }
  }

  static async getWorkRecords() {
    try {
      const { workRecords } = await chrome.storage.local.get('workRecords');
      return workRecords || {};
    } catch (error) {
      console.error('Failed to get work records:', error);
      return {};
    }
  }

  static async getWeeklyTotal() {
    const records = await this.getWorkRecords();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    return Object.entries(records)
      .filter(([date]) => new Date(date) >= weekStart)
      .reduce((total, [, dayRecords]) => {
        return total + dayRecords.reduce((dayTotal, record) => dayTotal + record.duration, 0);
      }, 0);
  }

  static async getMonthlyTotal() {
    const records = await this.getWorkRecords();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return Object.entries(records)
      .filter(([date]) => new Date(date) >= monthStart)
      .reduce((total, [, dayRecords]) => {
        return total + dayRecords.reduce((dayTotal, record) => dayTotal + record.duration, 0);
      }, 0);
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
} 