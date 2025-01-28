class QueueManager {
  static async addToQueue(type, data) {
    const queue = await this.getQueue();
    queue.push({
      id: Date.now(),
      type,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0
    });
    await this.saveQueue(queue);
  }

  static async processQueue() {
    const queue = await this.getQueue();
    for (const item of queue) {
      try {
        await this.processOperation(item);
        await this.removeFromQueue(item.id);
      } catch (error) {
        if (item.retryCount < 3) {
          item.retryCount++;
          await this.saveQueue(queue);
        } else {
          await this.handleFailedOperation(item);
        }
      }
    }
  }

  static async processOperation(item) {
    switch (item.type) {
      case 'EMAIL':
        await this.processEmailQueue(item.data);
        break;
      case 'WORK_RECORD':
        await StorageManager.saveWorkRecord(item.data);
        break;
      case 'STATUS_UPDATE':
        await StorageManager.saveWorkStatus(item.data);
        break;
      default:
        throw new Error(`Unknown operation type: ${item.type}`);
    }
  }

  static async processEmailQueue(emailData) {
    const emailService = new EmailService();
    await emailService.sendDailyReport(emailData.email, emailData.workData);
  }

  static async getQueue() {
    const { workQueue = [] } = await chrome.storage.local.get('workQueue');
    return workQueue;
  }

  static async saveQueue(queue) {
    await chrome.storage.local.set({ workQueue: queue });
  }

  static async removeFromQueue(id) {
    const queue = await this.getQueue();
    const newQueue = queue.filter(item => item.id !== id);
    await this.saveQueue(newQueue);
  }

  static async handleFailedOperation(item) {
    const { failedOperations = [] } = await chrome.storage.local.get('failedOperations');
    failedOperations.push(item);
    await chrome.storage.local.set({ failedOperations });
    await this.removeFromQueue(item.id);
  }
} 