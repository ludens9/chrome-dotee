class QueueManager {
  static async addToQueue(type, data) {
    const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
    
    offlineQueue.push({
      type,
      data,
      timestamp: new Date().toISOString()
    });

    await chrome.storage.local.set({ offlineQueue });
  }

  static async processOfflineQueue() {
    const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
    if (!offlineQueue.length) return;

    for (const item of offlineQueue) {
      try {
        switch (item.type) {
          case 'EMAIL':
            await this.processEmailQueue(item.data);
            break;
          case 'WORK_RECORD':
            await this.processWorkRecord(item.data);
            break;
        }
      } catch (error) {
        console.error('Queue processing error:', error);
        return; // 처리 중단, 다음 온라인 시에 재시도
      }
    }

    // 성공적으로 처리된 큐 클리어
    await chrome.storage.local.set({ offlineQueue: [] });
  }

  static async processEmailQueue(emailData) {
    const emailService = new EmailService();
    await emailService.sendDailyReport(emailData.email, emailData.workData);
  }

  static async processWorkRecord(recordData) {
    await StorageManager.saveWorkRecord(recordData);
  }
} 